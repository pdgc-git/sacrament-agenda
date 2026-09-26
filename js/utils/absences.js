// Absence history for the Ausências screen. Only absences are stored, so a Sunday only counts as
// "taken" when at least one absence was marked on it; every other Sunday has no data (nobody is
// assumed present). Pure functions, tested in tests/absences.test.js.

/**
 * @param {Array} rows   [{meeting_date, member_id}] absences in the window
 * @param {string} date  the Sunday on screen (iso)
 * @param {Set} absentNow member ids marked on `date` right now
 * @param {number} size  how many recorded Sundays to show
 * @returns {{dates: string[], byMember: Map<string, Set<string>>, recorded: Set<string>}}
 *   dates: the recorded Sundays up to `date`, newest first, plus `date` itself
 */
export function buildAbsenceHistory(rows, date, absentNow = new Set(), size = 8) {
    const byMember = new Map();
    const recorded = new Set();
    rows.forEach(r => {
        if (r.meeting_date === date) return; // `absentNow` is the live truth for the Sunday on screen
        recorded.add(r.meeting_date);
        if (!byMember.has(r.member_id)) byMember.set(r.member_id, new Set());
        byMember.get(r.member_id).add(r.meeting_date);
    });
    absentNow.forEach(id => {
        if (!byMember.has(id)) byMember.set(id, new Set());
        byMember.get(id).add(date);
    });
    if (absentNow.size) recorded.add(date);
    const past = [...recorded].filter(d => d < date).sort().reverse().slice(0, size - 1);
    return { dates: [date, ...past], byMember, recorded };
}

// 'absent' | 'present' | 'nodata' for one member on one Sunday.
export function dayState(history, memberId, d) {
    if (!history.recorded.has(d)) return 'nodata';
    return history.byMember.get(memberId)?.has(d) ? 'absent' : 'present';
}

// Consecutive absences counting back from the newest recorded Sunday; Sundays without data are skipped.
export function absenceStreak(history, memberId) {
    let n = 0;
    for (const d of history.dates) {
        const s = dayState(history, memberId, d);
        if (s === 'nodata') continue;
        if (s === 'absent') n++; else break;
    }
    return n;
}
