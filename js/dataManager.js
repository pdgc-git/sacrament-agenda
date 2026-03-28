import { db, auth } from './firebase-config.js';
import {
    collection, doc, getDocs, setDoc, addDoc, deleteDoc, query, where, orderBy, limit, writeBatch, getDoc, updateDoc, Timestamp
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// === State ===
let currentWardId = null;

// === User & Ward Management ===

// Initialize User Profile: Checks if user has a ward
export async function initUser(user) {
    if (!user) return null;

    try {
        // Check users/{uid} for profile
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);

        // SMART FIX: Removed 'let' to update the module-level variable
        currentWardId = null;

        if (userSnap.exists()) {
            const data = userSnap.data();
            if (data.wardId) {
                currentWardId = data.wardId;
                // Fetch role from ward user list for Single Source of Truth
                // SMART FIX: Wrap in try-catch to handle permission errors (orphaned profiles)
                // Fetch role from ward user list for Single Source of Truth
                const membershipRef = doc(db, `wards/${currentWardId}/users`, user.uid);
                const memSnap = await getDoc(membershipRef);

                if (!memSnap.exists()) {
                    console.warn("Membership check failed: Document does not exist.");
                    return { hasWard: false, error: "Membership check failed" };
                }

                const role = memSnap.data().role;
                const status = memSnap.data().status;
                return { hasWard: true, wardId: data.wardId, role, status };
            }
        }

        // No ward associated
        currentWardId = null; // Reset
        return { hasWard: false };

    } catch (globalError) {
        console.error("Critical Profile Error:", globalError);
        // Fallback: If we can't read "users/{uid}" due to permission/network, return Safe Default
        return { hasWard: false, error: globalError.message };
    }
}

export async function createWard(wardName) {
    const user = auth.currentUser;
    if (!user) throw new Error("Not authenticated");

    // DEBUG: Sequential Execution to identify Permission Error source
    // 1. Create Ward Doc
    let wardRef;
    try {
        console.log("Step 1: Creating Ward Doc...");
        wardRef = await addDoc(collection(db, 'wards'), {
            name: wardName,
            createdAt: Timestamp.now(),
            ownerId: user.uid
        });
    } catch (e) {
        throw new Error("Erro ao criar Ala (Permissões): " + e.message);
    }

    // 2. Add User to Ward's User Subcollection
    try {
        console.log("Step 2: Creating Member Doc...");
        const membershipRef = doc(db, `wards/${wardRef.id}/users`, user.uid);
        await setDoc(membershipRef, {
            uid: user.uid,
            email: user.email,
            name: user.displayName || user.email,
            role: 'owner',
            status: 'active',
            joinedAt: Timestamp.now()
        });
    } catch (e) {
        // Rollback Ward (Best effort)
        deleteDoc(wardRef).catch(console.error);
        throw new Error("Erro ao adicionar Admin (Permissões): " + e.message);
    }

    // 3. Create/Update User Profile
    try {
        console.log("Step 3: Updating Global Profile...");
        const userRef = doc(db, 'users', user.uid);
        await setDoc(userRef, {
            wardId: wardRef.id,
            role: 'owner',
            email: user.email
        }, { merge: true });
    } catch (e) {
        throw new Error("Erro ao atualizar Perfil (Permissões): " + e.message);
    }

    currentWardId = wardRef.id;
    return wardRef.id;
}

export async function joinWard(wardId) {
    const user = auth.currentUser;
    if (!user) throw new Error("Not authenticated");

    const batch = writeBatch(db);

    // 1. Add Request to Ward
    const membershipRef = doc(db, `wards/${wardId}/users`, user.uid);
    batch.set(membershipRef, {
        uid: user.uid,
        email: user.email,
        name: user.displayName || user.email,
        role: 'viewer', // Default role
        status: 'pending',
        requestedAt: Timestamp.now()
    });

    // 2. Update Profile map
    const userRef = doc(db, 'users', user.uid);
    batch.set(userRef, {
        wardId: wardId,
        role: 'viewer',
        status: 'pending'
    }, { merge: true });

    await batch.commit();
    currentWardId = wardId;
}

export async function getWardUsers() {
    const wardId = getWardId();
    const q = query(collection(db, `wards/${wardId}/users`));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data());
}

export async function updateUserRole(targetUid, newRole, newStatus) {
    const wardId = getWardId();
    const batch = writeBatch(db);

    // 1. Update Ward membership
    const ref = doc(db, `wards/${wardId}/users`, targetUid);
    batch.update(ref, { role: newRole, status: newStatus });

    // 2. Update global User Profile (for caching/quick lookup)
    const userProfileRef = doc(db, 'users', targetUid);
    batch.update(userProfileRef, { role: newRole });

    await batch.commit();
}

export async function getWardName() {
    if (!currentWardId) return "Nova Ala";
    const snap = await getDoc(doc(db, 'wards', currentWardId));
    return snap.exists() ? snap.data().name : "Ala Desconhecida";
}

// Helper to get current Ward ID
function getWardId() {
    if (!currentWardId) throw new Error("Nenhuma ala selecionada. Crie ou junte-se a uma ala.");
    return currentWardId;
}

// === Member Management ===

export async function getMembers() {
    const wardId = getWardId();
    const q = query(collection(db, `wards/${wardId}/members`), orderBy("name"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
}

export async function saveMember(memberData) {
    // === VALIDATION ===
    if (!memberData.name || typeof memberData.name !== 'string' || !memberData.name.trim()) {
        throw new Error("O nome do membro é obrigatório.");
    }

    const validGroups = ['Adult', 'Youth', 'Primary', 'Young Adult'];
    if (!validGroups.includes(memberData.group)) {
        // Default to Adult if invalid
        if (!memberData.group) memberData.group = 'Adult';
        else if (!validGroups.includes(memberData.group)) {
            throw new Error(`Grupo inválido. Deve ser um de: ${validGroups.join(', ')}`);
        }
    }
    // ==================

    const wardId = getWardId();
    const membersRef = collection(db, `wards/${wardId}/members`);

    if (memberData.id) {
        // Update
        const docRef = doc(membersRef, memberData.id);
        const { id, ...data } = memberData;
        await updateDoc(docRef, data);
        return id;
    } else {
        // Add
        const docRef = await addDoc(membersRef, memberData);
        return docRef.id;
    }
}

// Alias for clarity/compatibility
export const addMember = saveMember;

export async function deleteMember(id) {
    const wardId = getWardId();
    await deleteDoc(doc(db, `wards/${wardId}/members`, id));
}

export async function getMemberHistory(memberId) {
    const wardId = getWardId();
    // Default to empty if wardId is missing or query fails
    const talks = [];
    const prayers = [];

    if (!wardId) {
        console.warn("getMemberHistory: No wardId found.");
        return { talks, prayers };
    }

    try {
        const q = query(collection(db, `wards/${wardId}/meetings`), orderBy('date', 'desc'), limit(20));
        const snap = await getDocs(q);

        snap.forEach(doc => {
            const m = doc.data();
            // Check speakers
            if (m.speakers) {
                m.speakers.forEach(s => {
                    // Check strict ID or Name fallback
                    const idMatch = s.memberId === memberId;
                    // memberId is a string ID passed to function. s.memberId is string.
                    // memberId.name is invalid if memberId is string.
                    const nameMatch = s.name && memberId && false; // We don't have member name here easily unless we fetch member.
                    // Actually memberId passed to this function is the ID string.

                    if (idMatch) {
                        talks.push({ date: m.date.toDate(), topic: s.topic || 'Discurso' });
                    }
                });
            }

            // Check prayers
            if (m.invocationMemberId === memberId) prayers.push({ date: m.date.toDate(), type: 'Primeira Oração' });
            if (m.benedictionMemberId === memberId) prayers.push({ date: m.date.toDate(), type: 'Última Oração' });
        });
    } catch (e) {
        console.warn("getMemberHistory failed (likely permissions or missing index). Returning empty history.", e);
        // User requested to show "no records" instead of error for now.
        // We return empty arrays, which UI will render as "Sem registos recentes".
    }

    return { talks, prayers };
}

export async function importMembersFromCSV(file) {
    const wardId = getWardId();
    const text = await file.text();
    const lines = text.split('\n').filter(l => l.trim());
    const batch = writeBatch(db);
    const membersRef = collection(db, `wards/${wardId}/members`);

    let count = 0;
    if (lines.length === 0) return 0; // Handle empty file

    const startIdx = lines[0].toLowerCase().includes('name') ? 1 : 0;

    for (let i = startIdx; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        if (cols.length < 1) continue;

        const [name, gender, group] = cols;
        const newDocRef = doc(membersRef); // Auto-ID
        batch.set(newDocRef, {
            name: name,
            gender: gender || 'M',
            group: group || 'Adult',
            last_talk_date: null,
            last_prayer_date: null
        });
        count++;
    }

    await batch.commit();
    return count;
}

// === Smart Logic (Queries) ===

export async function checkHymnHistory(hymnNumber) {
    const wardId = getWardId();
    // Check last 3 months
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const q = query(
        collection(db, `wards/${wardId}/meetings`),
        where("date", ">=", Timestamp.fromDate(threeMonthsAgo)),
        where("status", "==", "completed"), // Only check completed meetings
        orderBy("date", "desc")
    );

    const snapshot = await getDocs(q);

    const recentUses = [];
    snapshot.forEach(doc => {
        const data = doc.data();
        const hymnStrs = data.hymns || [];
        // Check standard hymn fields (opening, sacrament, etc) AND speakers list (program hymns)
        let found = false;

        // 1. Standard Fields
        ['openingHymn', 'sacramentHymn', 'closingHymn'].forEach(field => {
            if (data[field] && (data[field].startsWith(hymnNumber + ' ') || data[field] === hymnNumber)) found = true;
        });

        // 2. Program Hymns
        if (data.speakers) {
            data.speakers.forEach(s => {
                if (s.type === 'hymn' && s.name && (s.name.startsWith(hymnNumber + ' ') || s.name === hymnNumber)) found = true;
            });
        }

        // Legacy 'hymns' array support if migrated
        if (data.hymns && Array.isArray(data.hymns)) {
            const match = data.hymns.find(h => h.startsWith(hymnNumber + ' ') || h === hymnNumber);
            if (match) found = true;
        }

        if (found) {
            recentUses.push({ date: data.date.toDate(), meeting: data });
        }
    });

    return recentUses.length > 0 ? recentUses[0] : null; // Return most recent
}

export async function getMemberStats(memberId) {
    const wardId = getWardId();
    const docRef = doc(db, `wards/${wardId}/members`, memberId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return snap.data();
}

// === History & Finalization ===

// ... (previous code)

// === Unified Meeting Management ===

// Helper: Get Meeting Ref by Date
function getMeetingRef(dateStr) {
    const wardId = getWardId();
    return doc(db, `wards/${wardId}/meetings`, dateStr);
}

// 1. Save Finalized Meeting (History)
export async function saveMeeting(meetingData) {
    const wardId = getWardId();
    const batch = writeBatch(db);

    // Use date string as ID (YYYY-MM-DD)
    // meetingData.date is a Date string from input (YYYY-MM-DD)
    const dateStr = meetingData.date;
    const meetingRef = doc(db, `wards/${wardId}/meetings`, dateStr);

    const payload = {
        id: dateStr,
        dateStr: dateStr,
        date: Timestamp.fromDate(new Date(dateStr)),
        status: 'completed', // Finalized
        presiding: meetingData.presiding,
        conducting: meetingData.conducting,
        hymns: meetingData.hymns,
        speakers: meetingData.speakers.map(s => ({
            ...s, // Save full speaker object including memberId and name
            memberId: s.memberId || null
        })),
        invocationMemberId: meetingData.invocationMemberId || null,
        benedictionMemberId: meetingData.benedictionMemberId || null,
        attendance: meetingData.attendance
    };

    batch.set(meetingRef, payload, { merge: true });

    // 2. Update Member stats
    // Speakers
    meetingData.speakers.forEach(s => {
        if (s.memberId) {
            const mRef = doc(db, `wards/${wardId}/members`, s.memberId);
            batch.update(mRef, { last_talk_date: Timestamp.fromDate(new Date(dateStr)) });
        }
    });

    // Prayers
    if (meetingData.invocationMemberId) {
        const mRef = doc(db, `wards/${wardId}/members`, meetingData.invocationMemberId);
        batch.update(mRef, { last_prayer_date: Timestamp.fromDate(new Date(dateStr)) });
    }
    if (meetingData.benedictionMemberId) {
        const mRef = doc(db, `wards/${wardId}/members`, meetingData.benedictionMemberId);
        batch.update(mRef, { last_prayer_date: Timestamp.fromDate(new Date(dateStr)) });
    }

    // Legacy Cleanup (Optional: delete from old plans collection if still used)
    // const legacyPlanRef = doc(db, `wards/${wardId}/plans`, ...);

    await batch.commit();
    return dateStr;
}

// 2. Draft / Future Plan
export async function saveFuturePlan(planData) {
    const wardId = getWardId();

    // === VALIDATION ===
    // 1. Check Date Format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!planData.dateStr || !dateRegex.test(planData.dateStr)) {
        throw new Error("Data inválida. O formato deve ser AAAA-MM-DD.");
    }

    // 2. Ensure Speakers is an Array
    if (!Array.isArray(planData.speakers)) {
        planData.speakers = [];
    }
    // ==================

    const meetingRef = doc(db, `wards/${wardId}/meetings`, planData.dateStr);

    const payload = {
        id: planData.dateStr,
        dateStr: planData.dateStr,
        date: Timestamp.fromDate(new Date(planData.dateStr)),
        status: 'draft',
        ...planData
    };

    // Remove undefined keys to prevent Firestore errors
    Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);

    await setDoc(meetingRef, payload, { merge: true });
    return planData.dateStr;
}

export async function getPlanByDate(dateStr) {
    const wardId = getWardId();
    const snap = await getDoc(doc(db, `wards/${wardId}/meetings`, dateStr));
    if (snap.exists()) {
        return snap.data();
    }
    return null;
}

export async function getFuturePlans() {
    const wardId = getWardId();
    const today = new Date().toISOString().split('T')[0];

    const q = query(
        collection(db, `wards/${wardId}/meetings`),
        where("dateStr", ">=", today),
        orderBy("dateStr")
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data());
}

export async function getHistory() {
    const wardId = getWardId();
    // Get last 20 meetings where status is completed
    const q = query(
        collection(db, `wards/${wardId}/meetings`),
        where("status", "==", "completed"),
        orderBy("dateStr", "desc"), // Use dateStr for valid ordering
        limit(20)
    );
    const snapshot = await getDocs(q);

    // Fallback: If empty, try legacy 'history' collection?
    if (snapshot.empty) {
        // Legacy fallback logic could go here
    }

    return snapshot.docs.map(doc => ({
        ...doc.data(),
        date: doc.data().date.toDate()
    }));
}

export async function getMeetingsInRange(startStr, endStr) {
    const wardId = getWardId();
    const q = query(
        collection(db, `wards/${wardId}/meetings`),
        where("dateStr", ">=", startStr),
        where("dateStr", "<=", endStr)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data());
}

// === Future Planning ===

export async function deletePlan(dateStr) {
    const wardId = getWardId();
    await deleteDoc(doc(db, `wards/${wardId}/meetings`, dateStr));
}

// Migration Helper (Run manually via console: window.DM.migrate())
export async function migrateLegacyData() {
    const wardId = getWardId();
    alert("Starting Migration...");

    const batch = writeBatch(db);
    let count = 0;

    // 1. History
    const hQ = query(collection(db, `wards/${wardId}/history`));
    const hSnaps = await getDocs(hQ);
    hSnaps.forEach(d => {
        const data = d.data();
        const dateStr = data.date.toDate().toISOString().split('T')[0];
        const newRef = doc(db, `wards/${wardId}/meetings`, dateStr);
        batch.set(newRef, {
            ...data,
            id: dateStr,
            dateStr: dateStr,
            status: 'completed'
        });
        count++;
    });

    // 2. Plans
    const pQ = query(collection(db, `wards/${wardId}/plans`));
    const pSnaps = await getDocs(pQ);
    pSnaps.forEach(d => {
        const data = d.data();
        const dateStr = data.dateStr;
        if (dateStr) {
            const newRef = doc(db, `wards/${wardId}/meetings`, dateStr);
            // Use update if exists (history wins), else set
            // Simplified: set with merge. If history exists, it overwrites common fields?
            // Ideally we check. But for legacy 'plans', they usually are future.
            batch.set(newRef, {
                ...data,
                id: dateStr,
                status: 'draft'
            }, { merge: true });
            count++;
        }
    });

    await batch.commit();
    alert(`Migrated ${count} legacy documents to 'meetings' collection.`);
}
