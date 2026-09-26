// Assignment actions shared by Plano and Domingo: pick a speaker / prayer / hymn for a meeting
// through the ranked picker, using the shared app state for rotation stats. Each function mutates
// the meeting object and calls `onChange()` so the caller can redraw + save.
import { state } from '../app-state.js';
import { hymns } from '../hymns.js';
import { openMemberPicker, openHymnPicker } from './picker.js';
import { speakers, balance, formatDateShort, toIsoDate, newSpeaker } from '../utils/meeting.js';

export const HYMN_LABELS = {
    opening_hymn: 'Hino de Abertura', sacrament_hymn: 'Hino Sacramental',
    intermediate_hymn: 'Hino Intermediário', closing_hymn: 'Hino de Encerramento',
};

export function pickSpeaker(m, i, anchor, onChange, monthBalance) {
    const sp = speakers(m.program);
    const s = sp[i];
    if (!s) return;
    const excludeIds = new Set(sp.filter(x => x !== s && x.member_id).map(x => x.member_id));
    const declinedIds = new Set(sp.filter(x => x.invite_status === 'declined' && x.member_id).map(x => x.member_id));
    openMemberPicker(anchor, {
        title: `Orador ${i + 1} · ${formatDateShort(m.date)}`,
        verb: 'falou',
        members: state.members,
        lastDates: state.lastTalk,
        stats: state.activity.talks,
        excludeIds, declinedIds,
        recentDays: 90,
        balance: { sunday: balance(sp, state.membersById), month: monthBalance || balance(sp, state.membersById) },
        onPick: member => {
            Object.assign(s, { name: member.name, member_id: member.id, invite_status: 'to_ask', asked_at: null });
            onChange();
        },
        onGuest: name => {
            Object.assign(s, { name, member_id: null, invite_status: 'to_ask', asked_at: null });
            onChange();
        },
        onClear: () => {
            if (sp.length > (state.settings?.default_speakers || 3)) m.program.splice(m.program.indexOf(s), 1);
            else Object.assign(s, { name: '', member_id: null, topic: '', invite_status: 'to_ask', asked_at: null });
            onChange();
        },
    });
}

export function addSpeaker(m, position = 'before') {
    const s = newSpeaker({ position });
    m.program.push(s);
    return speakers(m.program).indexOf(s);
}

// Drops the i-th speaker slot (named or empty) from the program.
export function removeSpeaker(m, i) {
    const s = speakers(m.program)[i];
    if (s) m.program.splice(m.program.indexOf(s), 1);
}

export function setInviteStatus(m, i, status) {
    const s = speakers(m.program)[i];
    if (!s) return;
    s.invite_status = status;
    if (status === 'asked' && !s.asked_at) s.asked_at = toIsoDate(new Date());
}

export function pickPrayer(m, key, anchor, onChange) {
    const other = key === 'invocation' ? 'benediction' : 'invocation';
    const excludeIds = new Set([m[`${other}_member_id`], ...speakers(m.program).map(s => s.member_id)].filter(Boolean));
    openMemberPicker(anchor, {
        title: `${key === 'invocation' ? 'Primeira' : 'Última'} Oração · ${formatDateShort(m.date)}`,
        verb: 'orou',
        members: state.members,
        lastDates: state.lastPrayer,
        stats: state.activity.prayers,
        excludeIds,
        recentDays: 60,
        onPick: member => { m[`${key}_member_id`] = member.id; m[key] = member.name; onChange(); },
        onGuest: name => { m[`${key}_member_id`] = null; m[key] = name; onChange(); },
        onClear: () => { m[`${key}_member_id`] = null; m[key] = ''; onChange(); },
    });
}

export function pickHymn(m, key, anchor, onChange) {
    openHymnPicker(anchor, {
        title: `${HYMN_LABELS[key]} · ${formatDateShort(m.date)}`,
        hymns,
        lastSung: state.hymnLastSung,
        repeatMonths: state.settings?.hymn_repeat_months || 3,
        onPick: h => { m[key] = `${h.number} - ${h.title}`; onChange(); },
        onClear: () => { m[key] = ''; onChange(); },
    });
}

// True when the hymn was sung within the ward's repeat window before `meetingDate`. Only the
// latest use is known, so a use on or after the meeting (e.g. that meeting itself) can't warn.
export function hymnRepeats(value, meetingDate = toIsoDate(new Date())) {
    const n = String(value || '').match(/^\s*(\d+)/)?.[1];
    const last = n && state.hymnLastSung.get(n);
    if (!last || last >= meetingDate) return false;
    const days = Math.round((new Date(meetingDate) - new Date(last)) / 86400000);
    return days < (state.settings?.hymn_repeat_months || 3) * 30;
}
