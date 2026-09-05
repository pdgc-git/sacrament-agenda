import { supabase } from './api/supabase-client.js';

// === State ===
let currentWardId = null;

// === User & Ward Management ===

// Initialize User Profile: checks whether the signed-in user belongs to a ward.
export async function initUser(user) {
    currentWardId = null;
    if (!user) return null;

    try {
        const { data, error } = await supabase
            .from('ward_users')
            .select('ward_id, role, status')
            .eq('user_id', user.id)
            .maybeSingle();

        if (error) throw error;
        if (!data) return { hasWard: false };

        currentWardId = data.ward_id;
        return { hasWard: true, wardId: data.ward_id, role: data.role, status: data.status };
    } catch (globalError) {
        console.error("Critical Profile Error:", globalError);
        return { hasWard: false, error: globalError.message };
    }
}

export async function createWard(wardName) {
    const { data, error } = await supabase.rpc('create_ward', { p_name: wardName });
    if (error) throw new Error("Erro ao criar Ala: " + error.message);
    currentWardId = data.id;
    return data.id;
}

// Join a ward by its invite code (v1 took a pasted ward id; the schema only exposes join-by-code).
export async function joinWard(inviteCode) {
    const { data, error } = await supabase.rpc('join_ward', { code: inviteCode });
    if (error) throw new Error("Erro ao juntar-se à Ala: " + error.message);
    currentWardId = data.ward_id;
    return data.ward_id;
}

export async function getWardUsers() {
    const wardId = getWardId();
    const { data, error } = await supabase
        .from('ward_users')
        .select('*')
        .eq('ward_id', wardId);
    if (error) throw error;
    return data;
}

export async function updateUserRole(targetUserId, newRole, newStatus) {
    const wardId = getWardId();
    const { error } = await supabase
        .from('ward_users')
        .update({ role: newRole, status: newStatus })
        .eq('ward_id', wardId)
        .eq('user_id', targetUserId);
    if (error) throw error;
}

export async function getWardName() {
    if (!currentWardId) return "Nova Ala";
    const { data, error } = await supabase
        .from('wards')
        .select('name')
        .eq('id', currentWardId)
        .maybeSingle();
    if (error || !data) return "Ala Desconhecida";
    return data.name;
}

// Helper to get current Ward ID
function getWardId() {
    if (!currentWardId) throw new Error("Nenhuma ala selecionada. Crie ou junte-se a uma ala.");
    return currentWardId;
}

// === Member Management ===

export async function getMembers() {
    const wardId = getWardId();
    const { data, error } = await supabase
        .from('members')
        .select('*')
        .eq('ward_id', wardId)
        .order('name');
    if (error) throw error;
    return data;
}

export async function saveMember(memberData) {
    // === VALIDATION ===
    if (!memberData.name || typeof memberData.name !== 'string' || !memberData.name.trim()) {
        throw new Error("O nome do membro é obrigatório.");
    }

    const validGroups = ['Adult', 'Youth', 'Primary', 'Young Adult'];
    if (!memberData.group) {
        memberData.group = 'Adult';
    } else if (!validGroups.includes(memberData.group)) {
        throw new Error(`Grupo inválido. Deve ser um de: ${validGroups.join(', ')}`);
    }
    // ==================

    const wardId = getWardId();

    if (memberData.id) {
        const { id, ...fields } = memberData;
        const { error } = await supabase.from('members').update(fields).eq('id', id);
        if (error) throw error;
        return id;
    }

    const { data, error } = await supabase
        .from('members')
        .insert({ ...memberData, ward_id: wardId })
        .select('id')
        .single();
    if (error) throw error;
    return data.id;
}

// Alias for clarity/compatibility
export const addMember = saveMember;

export async function deleteMember(id) {
    const { error } = await supabase.from('members').delete().eq('id', id);
    if (error) throw error;
}

export async function getMemberHistory(memberId) {
    const wardId = getWardId();
    const talks = [];
    const prayers = [];

    if (!wardId) {
        console.warn("getMemberHistory: No wardId found.");
        return { talks, prayers };
    }

    try {
        const { data, error } = await supabase
            .from('meetings')
            .select('date, program, invocation_member_id, benediction_member_id')
            .eq('ward_id', wardId)
            .eq('status', 'completed')
            .order('date', { ascending: false })
            .limit(20);
        if (error) throw error;

        (data || []).forEach(m => {
            (m.program || []).forEach(item => {
                if (item.type === 'speaker' && item.member_id === memberId) {
                    talks.push({ date: new Date(m.date), topic: item.topic || 'Discurso' });
                }
            });
            if (m.invocation_member_id === memberId) prayers.push({ date: new Date(m.date), type: 'Primeira Oração' });
            if (m.benediction_member_id === memberId) prayers.push({ date: new Date(m.date), type: 'Última Oração' });
        });
    } catch (e) {
        console.warn("getMemberHistory failed (likely permissions). Returning empty history.", e);
    }

    return { talks, prayers };
}

export async function getMemberStats(memberId) {
    const wardId = getWardId();
    const { data, error } = await supabase
        .from('members')
        .select('*')
        .eq('id', memberId)
        .maybeSingle();
    if (error) throw error;
    return data;
}

// === Smart Logic (Queries) ===

export async function checkHymnHistory(hymnNumber) {
    const wardId = getWardId();
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const since = threeMonthsAgo.toISOString().split('T')[0];

    const { data, error } = await supabase
        .from('hymn_usage')
        .select('date, hymn_number')
        .eq('ward_id', wardId)
        .eq('hymn_number', hymnNumber)
        .gte('date', since)
        .order('date', { ascending: false })
        .limit(1);
    if (error) throw error;

    return data && data.length > 0 ? { date: new Date(data[0].date) } : null;
}

// === Unified Meeting Management ===

function buildMeetingPayload(data, wardId) {
    return {
        ward_id: wardId,
        date: data.date,
        presiding: data.presiding ?? null,
        conducting: data.conducting ?? null,
        organist: data.organist ?? null,
        chorister: data.chorister ?? null,
        opening_hymn: data.opening_hymn ?? null,
        sacrament_hymn: data.sacrament_hymn ?? null,
        closing_hymn: data.closing_hymn ?? null,
        intermediate_hymn: data.intermediate_hymn ?? null,
        invocation_member_id: data.invocation_member_id ?? null,
        benediction_member_id: data.benediction_member_id ?? null,
        invocation: data.invocation ?? null,
        benediction: data.benediction ?? null,
        is_fast_sunday: !!data.is_fast_sunday,
        program: data.program ?? [],
        recognitions: data.recognitions ?? [],
        announcements: data.announcements ?? [],
        releases: data.releases ?? [],
        callings: data.callings ?? [],
        attendance: data.attendance ?? null,
    };
}

// Save a finalized meeting: upsert its content, then flip draft -> completed via the RPC (bug #2
// fix — v1's UI never called this path, so rotation/history/hymn-warnings always saw empty data).
export async function saveMeeting(meetingData) {
    const wardId = getWardId();
    const payload = buildMeetingPayload(meetingData, wardId);

    const { error: upsertError } = await supabase
        .from('meetings')
        .upsert({ ...payload, status: 'draft' }, { onConflict: 'ward_id,date' });
    if (upsertError) throw upsertError;

    const { error: finalizeError } = await supabase.rpc('finalize_meeting', {
        p_ward_id: wardId,
        p_date: meetingData.date,
    });
    if (finalizeError) throw finalizeError;

    return meetingData.date;
}

export async function saveFuturePlan(planData) {
    const wardId = getWardId();

    // === VALIDATION ===
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!planData.date || !dateRegex.test(planData.date)) {
        throw new Error("Data inválida. O formato deve ser AAAA-MM-DD.");
    }
    if (!Array.isArray(planData.program)) {
        planData.program = [];
    }
    // ==================

    const payload = buildMeetingPayload(planData, wardId);
    const { error } = await supabase
        .from('meetings')
        .upsert({ ...payload, status: 'draft' }, { onConflict: 'ward_id,date' });
    if (error) throw error;
    return planData.date;
}

export async function getPlanByDate(dateStr) {
    const wardId = getWardId();
    const { data, error } = await supabase
        .from('meetings')
        .select('*')
        .eq('ward_id', wardId)
        .eq('date', dateStr)
        .maybeSingle();
    if (error) throw error;
    return data;
}

export async function getFuturePlans() {
    const wardId = getWardId();
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
        .from('meetings')
        .select('*')
        .eq('ward_id', wardId)
        .gte('date', today)
        .order('date');
    if (error) throw error;
    return data;
}

export async function getHistory() {
    const wardId = getWardId();
    const { data, error } = await supabase
        .from('meetings')
        .select('*')
        .eq('ward_id', wardId)
        .eq('status', 'completed')
        .order('date', { ascending: false })
        .limit(20);
    if (error) throw error;
    return data;
}

export async function getMeetingsInRange(startStr, endStr) {
    const wardId = getWardId();
    const { data, error } = await supabase
        .from('meetings')
        .select('*')
        .eq('ward_id', wardId)
        .gte('date', startStr)
        .lte('date', endStr);
    if (error) throw error;
    return data;
}

export async function deletePlan(dateStr) {
    const wardId = getWardId();
    const { error } = await supabase
        .from('meetings')
        .delete()
        .eq('ward_id', wardId)
        .eq('date', dateStr);
    if (error) throw error;
}
