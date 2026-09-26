// Pure helpers for meeting/program data. No DOM, no network — everything here is unit-tested.

export const MEETING_KINDS = {
    normal: 'Normal',
    fast: 'Jejum e Testemunho',
    conference: 'Conferência',
    primary: 'Programa da Primária',
    stake: 'Conferência de Estaca',
};

// Kinds that have no ward program to plan (no speakers, prayers or hymns from the ward).
export const KINDS_WITHOUT_PROGRAM = new Set(['conference', 'stake']);

export const INVITE_STATUS = {
    to_ask: 'por convidar',
    asked: 'convidado',
    confirmed: 'confirmado',
    declined: 'recusou',
};

// ── Dates ────────────────────────────────────────────────────────────────────

export function toIsoDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export function parseIsoDate(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
}

// Next Sunday on or after `from` (a Sunday returns itself).
export function nextSunday(from = new Date()) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
    return d;
}

// Every Sunday from `start` (inclusive, rolled forward to a Sunday) for `count` weeks.
export function sundaysFrom(start, count) {
    const out = [];
    let d = nextSunday(start);
    for (let i = 0; i < count; i++) {
        out.push(toIsoDate(d));
        d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7);
    }
    return out;
}

// All Sundays of a month given as 'YYYY-MM'.
export function sundaysInMonth(ym) {
    const [y, m] = ym.split('-').map(Number);
    const out = [];
    const d = nextSunday(new Date(y, m - 1, 1));
    while (d.getMonth() === m - 1) { out.push(toIsoDate(d)); d.setDate(d.getDate() + 7); }
    return out;
}

// 'YYYY-MM' shifted by n months.
export function shiftMonth(ym, n) {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Weeks since epoch for a date: stable index into the conducting rotation, same in every view.
export function weekIndex(iso) {
    return Math.floor(parseIsoDate(iso).getTime() / (7 * 86400000));
}

const PT_MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const PT_MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// "14 de setembro de 2026" — same wording the shipped simple.html uses on the agenda paper.
export function formatDateLong(iso) {
    if (!iso) return '';
    const d = parseIsoDate(iso);
    return `${d.getDate()} de ${PT_MONTHS[d.getMonth()]} de ${d.getFullYear()}`;
}

// "Domingo, 14 de setembro"
export function formatDateHeading(iso) {
    const d = parseIsoDate(iso);
    return `Domingo, ${d.getDate()} de ${PT_MONTHS[d.getMonth()]}`;
}

// "14 set"
export function formatDateShort(iso) {
    const d = parseIsoDate(iso);
    return `${d.getDate()} ${PT_MONTHS_SHORT[d.getMonth()]}`;
}

// "setembro 2026"
export function formatMonth(iso) {
    const d = parseIsoDate(iso);
    return `${PT_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// Relative wording for rotation stats: "nunca", "há 2 semanas", "há 3 meses", "há 1 ano".
export function formatAgo(iso, today = new Date()) {
    if (!iso) return 'nunca';
    const then = parseIsoDate(iso);
    const days = Math.round((today - then) / 86400000);
    if (days < 7) return 'esta semana';
    if (days < 60) { const w = Math.round(days / 7); return `há ${w} semana${w === 1 ? '' : 's'}`; }
    if (days < 365) { const m = Math.round(days / 30.4); return `há ${m} ${m === 1 ? 'mês' : 'meses'}`; }
    const y = Math.floor(days / 365);
    return `há ${y} ano${y === 1 ? '' : 's'}`;
}

// ── Program ──────────────────────────────────────────────────────────────────

export function speakers(program = []) {
    return program.filter(i => i.type === 'speaker');
}

export function speakersBefore(program = []) {
    return speakers(program).filter(s => (s.position || 'before') === 'before');
}

export function speakersAfter(program = []) {
    return speakers(program).filter(s => s.position === 'after');
}

export function newSpeaker(overrides = {}) {
    return {
        type: 'speaker',
        id: cryptoId(),
        name: '',
        member_id: null,
        topic: '',
        invite_status: 'to_ask',
        asked_at: null,
        position: 'before',
        ...overrides,
    };
}

function cryptoId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Math.random().toString(36).slice(2);
}

// Empty meeting for a date, prefilled from ward settings. `conductingIndex` picks from the rotation.
export function blankMeeting(date, settings = {}, conductingIndex = 0) {
    const rotation = settings.conducting_rotation || [];
    const n = settings.default_speakers || 3;
    return {
        date,
        status: 'draft',
        kind: 'normal',
        presiding: settings.presiding || '',
        conducting: rotation.length ? rotation[conductingIndex % rotation.length] : '',
        organist: settings.organist || '',
        chorister: settings.chorister || '',
        opening_hymn: '', sacrament_hymn: '', closing_hymn: '', intermediate_hymn: '',
        invocation_member_id: null, benediction_member_id: null,
        invocation: '', benediction: '',
        program: Array.from({ length: n }, () => newSpeaker()),
        recognitions: [], announcements: [], releases: [], callings: [],
        attendance: null,
    };
}

// ── Readiness ("Falta N") ────────────────────────────────────────────────────
// Counts what is still missing for the meeting to be ready: unassigned or unconfirmed speakers,
// missing prayers, missing hymns. Kinds without a ward program have nothing to plan.

export function missingItems(m) {
    if (!m || KINDS_WITHOUT_PROGRAM.has(m.kind)) return [];
    const out = [];
    if (m.kind !== 'fast') {
        speakers(m.program).forEach((s, i) => {
            if (!s.name) out.push(`orador ${i + 1} por atribuir`);
            else if (s.invite_status === 'declined') out.push(`${s.name} recusou`);
            else if (s.invite_status !== 'confirmed') out.push(`${s.name} por confirmar`);
        });
    }
    if (!m.invocation && !m.invocation_member_id) out.push('primeira oração');
    if (!m.benediction && !m.benediction_member_id) out.push('última oração');
    if (!m.opening_hymn) out.push('hino de abertura');
    if (!m.sacrament_hymn) out.push('hino sacramental');
    if (!m.closing_hymn) out.push('hino de encerramento');
    return out;
}

// ── Balance (H · M · jovens) ────────────────────────────────────────────────
// Given the speakers of one or more meetings and the member roster, count by gender and youth.

export function balance(speakerItems, membersById) {
    const b = { men: 0, women: 0, youth: 0, youngAdults: 0, unknown: 0 };
    speakerItems.forEach(s => {
        if (!s.name) return;
        const m = s.member_id ? membersById.get(s.member_id) : null;
        if (!m) { b.unknown++; return; }
        if (m.gender === 'M') b.men++;
        else if (m.gender === 'F') b.women++;
        else b.unknown++;
        if (m.group === 'Youth') b.youth++;
        if (m.group === 'Young Adult') b.youngAdults++;
    });
    return b;
}

export function formatBalance(b) {
    const parts = [`${b.men}H`, `${b.women}M`];
    parts.push(`${b.youth} ${b.youth === 1 ? 'jovem' : 'jovens'}`);
    return parts.join(' · ');
}

// ── Hymn strings ────────────────────────────────────────────────────────────
// Hymns are stored as "112 - Sim, Eu Te Sigo" (v1 convention). Extract the number.

export function hymnNumber(str) {
    if (!str) return null;
    const m = String(str).match(/^\s*(\d+)/);
    return m ? m[1] : null;
}

// "112 - Sim, Eu Te Sigo" → "Sim, Eu Te Sigo". A value without a number is returned as is.
export function hymnTitle(str) {
    if (!str) return '';
    return String(str).replace(/^\s*\d+\s*[-–—.:]?\s*/, '').trim();
}

// ── Activity (for the pickers) ──────────────────────────────────────────────
// From completed meetings, per member: how many talks / prayers in the last 12 months and the
// topic of the most recent talk. rows: [{date, program, invocation_member_id, benediction_member_id}]

export function buildActivity(rows = [], today = new Date()) {
    const since = new Date(today); since.setFullYear(since.getFullYear() - 1);
    const talks = new Map();
    const prayers = new Map();
    const bump = (map, id, date, extra = {}) => {
        if (!id) return;
        const cur = map.get(id) || { count12: 0, last: null };
        if (parseIsoDate(date) >= since) cur.count12++;
        if (!cur.last || date > cur.last) Object.assign(cur, { last: date }, extra);
        map.set(id, cur);
    };
    rows.forEach(r => {
        (r.program || []).filter(it => it.type === 'speaker').forEach(it => bump(talks, it.member_id, r.date, { lastTopic: it.topic || '' }));
        bump(prayers, r.invocation_member_id, r.date);
        bump(prayers, r.benediction_member_id, r.date);
    });
    return { talks, prayers };
}
