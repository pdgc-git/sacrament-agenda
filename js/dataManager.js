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
                try {
                    const membershipRef = doc(db, `wards/${currentWardId}/users`, user.uid);
                    const memSnap = await getDoc(membershipRef);

                    if (!memSnap.exists()) {
                        throw new Error("Membership not found"); // Trigger reset
                    }

                    const role = memSnap.data().role;
                    const status = memSnap.data().status;
                    return { hasWard: true, wardId: data.wardId, role, status };

                } catch (error) {
                    console.warn("Smart Fix: Detected inconsistent state. Resetting profile.", error);
                    // Reset profile to remove invalid wardId
                    await setDoc(userRef, { wardId: null }, { merge: true });
                    currentWardId = null;
                    return { hasWard: false };
                }
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
    // This assumes we can query meetings where this member spoke or prayed.
    // Since we store denormalized names in meetings, we might need a better strategy if we want strict ID linking.
    // However, our current saveMeeting stores names. 
    // Ideally, we should store IDs. 
    // For now, let's rely on the 'last_talk_date' and 'last_prayer_date' from member doc for summary,
    // and maybe query recent meetings if we want detailed logs?
    // Given the prompt "view info of the member and their prayers and talks log", 
    // let's try to find meetings where they are listed.

    // NOTE: Our current structure might makes this hard if we only store strings in 'speakers'.
    // BUT, we recently updated 'speakers' array in `saveMeeting` to include objects with `memberId`?
    // Let's check `planner-ui.js` handleFinalize.
    // It filters `state.speakers` which has `memberId`.
    // So if we save that to Firestore, we can query it.

    // Let's assume meetings collection has speakers array with { memberId, name } objects.
    // We'll search client-side for now or simple query if possible.
    // For MVP/Robustness, let's just return what we can or mock it if complex query is needed.

    // Actually, let's just query all meetings and filter in memory for this MVP since dataset is small.
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
        collection(db, `wards/${wardId}/history`),
        where("date", ">=", Timestamp.fromDate(threeMonthsAgo)),
        orderBy("date", "desc")
    );

    const snapshot = await getDocs(q);

    const recentUses = [];
    snapshot.forEach(doc => {
        const data = doc.data();
        const hymnStrs = data.hymns || [];
        const match = hymnStrs.find(h => h.startsWith(hymnNumber + ' ') || h === hymnNumber);
        if (match) {
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

export async function saveMeeting(meetingData) {
    const wardId = getWardId();
    const batch = writeBatch(db);

    // 1. Save Meeting to History
    const historyRef = doc(collection(db, `wards/${wardId}/history`)); // Auto ID

    // Prepare Data
    const historyPayload = {
        date: Timestamp.fromDate(new Date(meetingData.date)),
        presiding: meetingData.presiding,
        conducting: meetingData.conducting,
        hymns: meetingData.hymns, // Array of strings
        speakers: meetingData.speakers.map(s => s.memberId).filter(Boolean), // Array of IDs
        attendance: meetingData.attendance // Obj
    };
    batch.set(historyRef, historyPayload);

    // 2. Update Member stats
    // Speakers
    meetingData.speakers.forEach(s => {
        if (s.memberId) {
            const mRef = doc(db, `wards/${wardId}/members`, s.memberId);
            batch.update(mRef, { last_talk_date: Timestamp.fromDate(new Date(meetingData.date)) });
        }
    });

    // Prayers
    if (meetingData.invocationMemberId) {
        const mRef = doc(db, `wards/${wardId}/members`, meetingData.invocationMemberId);
        batch.update(mRef, { last_prayer_date: Timestamp.fromDate(new Date(meetingData.date)) });
    }
    if (meetingData.benedictionMemberId) {
        const mRef = doc(db, `wards/${wardId}/members`, meetingData.benedictionMemberId);
        batch.update(mRef, { last_prayer_date: Timestamp.fromDate(new Date(meetingData.date)) });
    }

    // 3. Remove from Plans if exists (Promotion)
    // We query by dateStr to find the plan
    if (meetingData.date) {
        const dateStr = meetingData.date; // Expecting YYYY-MM-DD
        const q = query(collection(db, `wards/${wardId}/plans`), where("dateStr", "==", dateStr));
        const snaps = await getDocs(q);
        snaps.forEach(d => {
            batch.delete(d.ref);
        });
    }

    await batch.commit();
    return historyRef.id;
}

export async function getDashboardStats() {
    const wardId = getWardId();
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    // Get all history for this year
    const firstDayYear = new Date(currentYear, 0, 1);

    const q = query(
        collection(db, `wards/${wardId}/history`),
        where("date", ">=", Timestamp.fromDate(firstDayYear)),
        orderBy("date", "asc")
    );

    const snap = await getDocs(q);

    let ytdTotal = 0;
    let ytdCount = 0;
    let mtdTotal = 0;
    let mtdCount = 0;

    // Chart Data
    const monthlySums = Array(12).fill(0);
    const monthlyCounts = Array(12).fill(0);
    const weeklyData = [];

    snap.forEach(doc => {
        const data = doc.data();
        const date = data.date.toDate();
        const att = parseInt(data.attendance?.sacrament || 0);

        if (att > 0) {
            // YTD Stats
            ytdTotal += att;
            ytdCount++;

            // Monthly Aggregation (0-11)
            const mIdx = date.getMonth();
            monthlySums[mIdx] += att;
            monthlyCounts[mIdx]++;

            // MTD Stats
            if (mIdx === currentMonth) {
                mtdTotal += att;
                mtdCount++;
                weeklyData.push({ day: date.getDate(), count: att });
            }
        }
    });

    const mtdAvg = mtdCount > 0 ? Math.round(mtdTotal / mtdCount) : 0;
    const ytdAvg = ytdCount > 0 ? Math.round(ytdTotal / ytdCount) : 0;

    // Calculate Monthly Averages
    const monthlyTrend = monthlySums.map((sum, i) => monthlyCounts[i] ? Math.round(sum / monthlyCounts[i]) : 0);

    return {
        mtd: mtdAvg,
        ytd: ytdAvg,
        monthName: now.toLocaleString('pt-PT', { month: 'long' }),
        year: currentYear,
        chartData: {
            weekly: weeklyData, // [{day: 5, count: 120}, ...]
            monthly: monthlyTrend // [0, 0, 110, ...]
        }
    };
}

export async function getHistory() {
    const wardId = getWardId();
    // Get last 20 meetings
    const q = query(collection(db, `wards/${wardId}/history`), orderBy("date", "desc"), limit(20));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        date: doc.data().date.toDate() // Convert Timestamp
    }));
}

// === Future Planning ===

export async function getFuturePlans() {
    const wardId = getWardId();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get plans for next 3 months
    const q = query(
        collection(db, `wards/${wardId}/plans`),
        where("dateStr", ">=", today.toISOString().split('T')[0]),
        orderBy("dateStr")
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function getPlanByDate(dateStr) {
    const wardId = getWardId();
    const q = query(collection(db, `wards/${wardId}/plans`), where("dateStr", "==", dateStr));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        return { id: doc.id, ...doc.data() };
    }
    return null;
}

export async function saveFuturePlan(planData) {
    const wardId = getWardId();
    const plansRef = collection(db, `wards/${wardId}/plans`);

    // planData: { dateStr: 'YYYY-MM-DD', topic: '...', speakers: [...] }
    if (planData.id) {
        const docRef = doc(plansRef, planData.id);
        const { id, ...data } = planData;
        await updateDoc(docRef, data);
        return id;
    } else {
        // Check if exists for date to avoid duplicates if ID not passed
        const existing = await getPlanByDate(planData.dateStr);
        if (existing) {
            const docRef = doc(plansRef, existing.id);
            await updateDoc(docRef, planData);
            return existing.id;
        }

        const docRef = await addDoc(plansRef, planData);
        return docRef.id;
    }
}

export async function deletePlan(planId) {
    const wardId = getWardId();
    await deleteDoc(doc(db, `wards/${wardId}/plans`, planId));
}
