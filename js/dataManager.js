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

export async function getWard() {
    const wardId = getWardId();
    const { data, error } = await supabase
        .from('wards')
        .select('id, name, invite_code, owner_id')
        .eq('id', wardId)
        .maybeSingle();
    if (error) throw error;
    return data;
}

export async function updateWard(fields) {
    const wardId = getWardId();
    const { error } = await supabase.from('wards').update(fields).eq('id', wardId);
    if (error) throw error;
}

// New 8-char code, same shape as the DB default (substr(md5(random()),1,8)).
export async function regenerateInviteCode() {
    const code = Array.from(crypto.getRandomValues(new Uint8Array(4)), b => b.toString(16).padStart(2, '0')).join('');
    await updateWard({ invite_code: code });
    return code;
}

export async function approveMember(targetUserId, role) {
    const wardId = getWardId();
    const { data, error } = await supabase.rpc('approve_member', {
        p_ward_id: wardId, p_user_id: targetUserId, p_role: role,
    });
    if (error) throw new Error("Erro ao aprovar: " + error.message);
    return data;
}

export async function removeWardUser(targetUserId) {
    const wardId = getWardId();
    const { error } = await supabase
        .from('ward_users')
        .delete()
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

// Takes someone off the roster; their past talks and prayers stay on the meetings by name only.
export async function unregisterMember(id) {
    const { error } = await supabase.rpc('unregister_member', { p_member_id: id });
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
    getWardId();
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
        kind: data.kind ?? (data.is_fast_sunday ? 'fast' : 'normal'),
        is_fast_sunday: (data.kind ?? (data.is_fast_sunday ? 'fast' : 'normal')) === 'fast',
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

// === Ward settings (Phase 3) ===

export async function getWardSettings() {
    const wardId = getWardId();
    const { data, error } = await supabase
        .from('ward_settings')
        .select('*')
        .eq('ward_id', wardId)
        .maybeSingle();
    if (error) throw error;
    return data || {
        ward_id: wardId, presiding: '', conducting_rotation: [], organist: '', chorister: '',
        default_speakers: 3, absence_alert_after: 3, hymn_repeat_months: 3,
    };
}

export async function saveWardSettings(settings) {
    const wardId = getWardId();
    const { ward_id, updated_at, ...fields } = settings; // eslint-disable-line no-unused-vars
    const { error } = await supabase
        .from('ward_settings')
        .upsert({ ...fields, ward_id: wardId, updated_at: new Date().toISOString() }, { onConflict: 'ward_id' });
    if (error) throw error;
}

// === Rotation stats (derived views) ===

async function viewAsMap(view, keyCol, valCol) {
    const wardId = getWardId();
    const { data, error } = await supabase.from(view).select(`${keyCol}, ${valCol}`).eq('ward_id', wardId);
    if (error) throw error;
    return new Map((data || []).map(r => [String(r[keyCol]), r[valCol]]));
}

// member_id -> iso date of the last completed talk
export function getLastTalkDates() { return viewAsMap('member_last_talk', 'member_id', 'last_talk_date'); }
// member_id -> iso date of the last completed prayer
export function getLastPrayerDates() { return viewAsMap('member_last_prayer', 'member_id', 'last_prayer_date'); }

// Completed meetings of the last two years, only the columns the pickers' activity stats need.
export async function getActivityRows(today = new Date()) {
    const wardId = getWardId();
    const from = new Date(today); from.setFullYear(from.getFullYear() - 2);
    const { data, error } = await supabase.from('meetings')
        .select('date, program, invocation_member_id, benediction_member_id')
        .eq('ward_id', wardId).eq('status', 'completed').gte('date', from.toISOString().slice(0, 10));
    if (error) throw error;
    return data || [];
}

// hymn number -> iso date it was last sung (completed meetings only)
export async function getHymnLastSung() {
    const wardId = getWardId();
    const { data, error } = await supabase
        .from('hymn_usage')
        .select('hymn_number, date')
        .eq('ward_id', wardId)
        .order('date', { ascending: false });
    if (error) throw error;
    const map = new Map();
    (data || []).forEach(r => {
        const n = String(r.hymn_number).match(/^\s*(\d+)/)?.[1];
        if (n && !map.has(n)) map.set(n, r.date);
    });
    return map;
}

// === Finalize (Púlpito → "Terminar reunião") ===
// `confirmed.program` is the program as it actually happened (no-shows removed by the conductor).

export async function finalizeMeeting(confirmed) {
    const wardId = getWardId();
    const { data, error } = await supabase.rpc('finalize_meeting', {
        p_ward_id: wardId,
        p_date: confirmed.date,
        p_program: confirmed.program ?? null,
        p_invocation_member_id: confirmed.invocation_member_id ?? null,
        p_benediction_member_id: confirmed.benediction_member_id ?? null,
        p_attendance: confirmed.attendance ?? null,
    });
    if (error) throw new Error("Erro ao terminar a reunião: " + error.message);
    return data;
}

// === Absences (marked from the stand) ===

export async function getAbsences(dateStr) {
    const wardId = getWardId();
    const { data, error } = await supabase
        .from('absences')
        .select('member_id')
        .eq('ward_id', wardId)
        .eq('meeting_date', dateStr);
    if (error) throw error;
    return new Set((data || []).map(r => r.member_id));
}

export async function setAbsence(dateStr, memberId, absent) {
    const wardId = getWardId();
    if (absent) {
        const { error } = await supabase
            .from('absences')
            .upsert({ ward_id: wardId, meeting_date: dateStr, member_id: memberId }, { onConflict: 'ward_id,meeting_date,member_id' });
        if (error) throw error;
    } else {
        const { error } = await supabase
            .from('absences')
            .delete()
            .eq('ward_id', wardId)
            .eq('meeting_date', dateStr)
            .eq('member_id', memberId);
        if (error) throw error;
    }
}

// All absences in a date range: [{meeting_date, member_id}]
export async function getAbsencesInRange(startStr, endStr) {
    const wardId = getWardId();
    const { data, error } = await supabase
        .from('absences')
        .select('meeting_date, member_id')
        .eq('ward_id', wardId)
        .gte('meeting_date', startStr)
        .lte('meeting_date', endStr)
        .order('meeting_date', { ascending: false });
    if (error) throw error;
    return data || [];
}

// Dates that had a completed meeting in the range (the denominator for absence streaks).
export async function getCompletedDates(startStr, endStr) {
    const wardId = getWardId();
    const { data, error } = await supabase
        .from('meetings')
        .select('date')
        .eq('ward_id', wardId)
        .eq('status', 'completed')
        .gte('date', startStr)
        .lte('date', endStr)
        .order('date', { ascending: false });
    if (error) throw error;
    return (data || []).map(r => r.date);
}
