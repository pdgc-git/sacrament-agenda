// Relief Society test module — pure logic (no DOM), unit-tested in tests/ss.test.js.
// Attendance is stored as the set of sisters marked PRESENT per Sunday (the SS marks who came);
// a Sunday with no saved record has no data and never counts as an absence.

export const DAY = 86400000;

export function iso(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function parse(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
}
export function addDays(s, n) {
    const d = parse(s);
    return iso(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
}
// Today if Sunday, otherwise the last Sunday.
export function lastSunday(today = new Date()) {
    return iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay()));
}

// Recorded Sundays up to and including `date`, newest first.
export function recordedUpTo(attendance, date) {
    return Object.keys(attendance).filter(d => d <= date).sort().reverse();
}

// Consecutive recorded Sundays (ending at `date`) the sister was absent.
export function absenceStreak(attendance, sisterId, date) {
    let n = 0;
    for (const d of recordedUpTo(attendance, date)) {
        if (attendance[d].includes(sisterId)) break;
        n++;
    }
    return n;
}

// Present on `date` after missing at least `min` recorded Sundays in a row just before.
export function returnedAfter(attendance, sisterId, date, min = 2) {
    if (!attendance[date]?.includes(sisterId)) return 0;
    const before = recordedUpTo(attendance, addDays(date, -1));
    let n = 0;
    for (const d of before) {
        if (attendance[d].includes(sisterId)) break;
        n++;
    }
    return n >= min ? n : 0;
}

export function tier(streak) {
    if (streak >= 4) return 'four';
    if (streak >= 2) return 'two';
    return 'one';
}

export function isPaused(sister, date) {
    return !!sister.pausedUntil && sister.pausedUntil >= date;
}

export function joinNames(names) {
    if (names.length <= 1) return names[0] || '';
    return names.slice(0, -1).join(', ') + ' e ' + names[names.length - 1];
}

export function firstName(name) {
    return String(name || '').trim().split(/\s+/)[0] || '';
}

export function fill(template, vars) {
    return template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

// One message per pair that has at least one absent sister on `date` (absent = not marked present
// on a recorded Sunday). Sisters who can't be ministered to, or whose messages are paused, are
// skipped and listed separately. The text tier follows the longest streak in the pair.
export function pairMessages({ sisters, pairs, attendance, templates }, date) {
    const present = attendance[date];
    if (!present) return { messages: [], skipped: [], alerts: [] };
    const byId = new Map(sisters.map(s => [s.id, s]));
    const messages = [];
    const skipped = [];
    const alerts = [];
    for (const pair of pairs) {
        const absentees = sisters
            .filter(s => s.pairId === pair.id && s.status !== 'moved' && !present.includes(s.id))
            .map(s => ({ sister: s, streak: absenceStreak(attendance, s.id, date) }));
        const eligible = [];
        for (const a of absentees) {
            if (a.streak >= 4) alerts.push(a);
            if (!a.sister.canMinister) skipped.push({ ...a, reason: 'não pode ser ministrada' });
            else if (isPaused(a.sister, date)) skipped.push({ ...a, reason: `pausada até ${a.sister.pausedUntil}` });
            else eligible.push(a);
        }
        if (!eligible.length) continue;
        const maxStreak = Math.max(...eligible.map(a => a.streak));
        const ministers = pair.ministers.map(id => byId.get(id)).filter(Boolean);
        const ministradoras = joinNames(ministers.map(m => firstName(m.name)));
        // Sisters at different absence levels get their own paragraph (worst first) in the one message.
        const groups = ['four', 'two', 'one']
            .map(t => ({ t, list: eligible.filter(a => tier(a.streak) === t) }))
            .filter(g => g.list.length);
        let greeting = '';
        const parts = groups.map((g, gi) => {
            const plural = g.list.length > 1;
            let part = fill(templates.absence[g.t], {
                ministradoras,
                irma: joinNames(g.list.map(a => firstName(a.sister.name))),
                vossa: plural ? 'As vossas irmãs' : 'A vossa irmã',
                esteve: plural ? 'estiveram' : 'esteve',
                lhe: plural ? 'lhes' : 'lhe',
                ela: plural ? 'elas' : 'ela',
                semanas: String(Math.min(...g.list.map(a => a.streak))),
            });
            const m = part.match(/^[^!?.]*[!?.]\s+/);
            if (gi === 0) greeting = m ? m[0] : '';
            else if (m && greeting && m[0] === greeting) part = part.slice(m[0].length);
            return part;
        });
        const text = parts.join('\n\n');
        messages.push({ pair, ministers, absentees: eligible, maxStreak, text });
    }
    alerts.sort((a, b) => b.streak - a.streak);
    return { messages, skipped, alerts };
}

export function ageOn(birth, date) {
    const b = parse(birth);
    const d = parse(date);
    let age = d.getFullYear() - b.getFullYear();
    if (d.getMonth() < b.getMonth() || (d.getMonth() === b.getMonth() && d.getDate() < b.getDate())) age--;
    return age;
}

// This year's birthday date (YYYY-MM-DD) for a birth date, in `year`. 29 Feb → 28 Feb off leap years.
export function birthdayIn(birth, year) {
    const [, m, d] = birth.split('-').map(Number);
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return iso(new Date(year, m - 1, m === 2 && d === 29 && !leap ? 28 : d));
}

// People with a birthday in month `ym` ('YYYY-MM'), sorted by day.
export function birthdaysInMonth(people, ym) {
    const [y, m] = ym.split('-').map(Number);
    return people
        .filter(p => p.birth && Number(p.birth.slice(5, 7)) === m && p.status !== 'moved')
        .map(p => ({ person: p, date: birthdayIn(p.birth, y), age: ageOn(p.birth, birthdayIn(p.birth, y)) }))
        .sort((a, b) => a.date.localeCompare(b.date));
}

// Rotating birthday message: same person + year always gets the same template.
export function birthdayTemplateIndex(personId, year, count) {
    let h = year;
    for (const ch of String(personId)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return count ? h % count : 0;
}

export function shiftMonth(ym, n) {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// "Ninguém faz anos sozinho": birthdays in `ym` of people aged >= minAge that day, each given to an
// organization in rotation. The rotation continues across months: `offset` is how many were
// assigned before this month (so the same order never always starts with the same organization).
export function projectAssignments(people, ym, minAge, orgs, offset = 0) {
    return birthdaysInMonth(people, ym)
        .filter(b => b.age >= minAge)
        .map((b, i) => ({ ...b, org: orgs[(offset + i) % orgs.length] }));
}

// Number of project birthdays in the months from `startYm` up to (not including) `ym` — the
// rotation offset for `ym`.
export function projectOffset(people, ym, minAge, startYm) {
    let n = 0;
    for (let cur = startYm; cur < ym; cur = shiftMonth(cur, 1)) {
        n += birthdaysInMonth(people, cur).filter(b => b.age >= minAge).length;
    }
    return n;
}

export function waLink(text, phone = '') {
    const digits = String(phone).replace(/\D/g, '');
    return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
