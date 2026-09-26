// Shared in-memory state for the planner views. Views read from here and call `reload*` after
// writes; nothing here touches the DOM.
import * as DM from './dataManager.js';
import { buildActivity } from './utils/meeting.js';

export const state = {
    user: null,
    ward: null,            // {id, name, invite_code, owner_id}
    role: null,            // owner | admin | editor | music | viewer
    membership: null,      // {hasWard, wardId, role, status}
    settings: null,        // ward_settings row (or defaults)
    members: [],
    membersById: new Map(),
    lastTalk: new Map(),   // member_id -> iso date
    lastPrayer: new Map(),
    hymnLastSung: new Map(), // hymn number -> iso date
    activity: { talks: new Map(), prayers: new Map() }, // member_id -> {count12, last, lastTopic?}
    meetingsCache: new Map(), // date -> meeting row
};

export function canEdit() {
    return ['owner', 'admin', 'editor'].includes(state.role);
}
export function canAdmin() {
    return ['owner', 'admin'].includes(state.role);
}
export function canEditHymns() {
    return canEdit() || state.role === 'music';
}

export async function loadWard() {
    const [ward, settings] = await Promise.all([DM.getWard(), DM.getWardSettings()]);
    state.ward = ward;
    state.settings = settings;
    await Promise.all([reloadMembers(), reloadStats()]);
}

export async function reloadMembers() {
    state.members = await DM.getMembers();
    state.membersById = new Map(state.members.map(m => [m.id, m]));
}

export async function reloadStats() {
    const [lastTalk, lastPrayer, hymnLastSung, activityRows] = await Promise.all([
        DM.getLastTalkDates(), DM.getLastPrayerDates(), DM.getHymnLastSung(), DM.getActivityRows(),
    ]);
    state.activity = buildActivity(activityRows);
    state.lastTalk = lastTalk;
    state.lastPrayer = lastPrayer;
    state.hymnLastSung = hymnLastSung;
}

export async function reloadSettings() {
    state.settings = await DM.getWardSettings();
}

export function cacheMeetings(rows) {
    rows.forEach(r => state.meetingsCache.set(r.date, r));
}

export function reset() {
    state.user = null; state.ward = null; state.role = null; state.membership = null; state.settings = null;
    state.members = []; state.membersById = new Map();
    state.lastTalk = new Map(); state.lastPrayer = new Map(); state.hymnLastSung = new Map();
    state.activity = { talks: new Map(), prayers: new Map() };
    state.meetingsCache = new Map();
}
