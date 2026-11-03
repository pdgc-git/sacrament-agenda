import {
    absenceStreak, returnedAfter, tier, pairMessages, birthdaysInMonth, projectAssignments, projectOffset, ageOn, birthdayIn, lastSunday, iso,
} from '../ss/logic.js';
import { seed, DEFAULT_TEMPLATES } from '../ss/data.js';

const att = {
    '2026-10-04': ['a', 'b', 'c'],
    '2026-10-11': ['a', 'c'],
    '2026-10-18': ['a'],
    '2026-10-25': ['a', 'b'],
    '2026-11-01': ['a', 'b'],
};

describe('attendance', () => {
    test('streak counts only recorded Sundays, newest back', () => {
        expect(absenceStreak(att, 'a', '2026-11-01')).toBe(0);
        expect(absenceStreak(att, 'c', '2026-11-01')).toBe(3);
        expect(absenceStreak(att, 'b', '2026-10-18')).toBe(2);
        expect(absenceStreak(att, 'z', '2026-11-01')).toBe(5);
    });
    test('returnedAfter flags a return after 2+ missed Sundays', () => {
        expect(returnedAfter(att, 'b', '2026-10-25')).toBe(2);
        expect(returnedAfter(att, 'b', '2026-11-01')).toBe(0);
        expect(returnedAfter(att, 'c', '2026-11-01')).toBe(0);
    });
    test('tiers: 1 · 2–3 · 4+', () => {
        expect([1, 2, 3, 4, 9].map(tier)).toEqual(['one', 'two', 'two', 'four', 'four']);
    });
    test('lastSunday', () => {
        expect(lastSunday(new Date(2026, 10, 3))).toBe('2026-11-01');
        expect(lastSunday(new Date(2026, 10, 1))).toBe('2026-11-01');
    });
});

describe('pairMessages', () => {
    const sisters = [
        { id: 'm1', name: 'Manuela Faria', canMinister: true, pairId: '' },
        { id: 'm2', name: 'Carolina Matos', canMinister: true, pairId: '' },
        { id: 'x', name: 'Augusta Ramalho', canMinister: true, pairId: 'p' },
        { id: 'y', name: 'Rosa Cardoso', canMinister: true, pairId: 'p' },
        { id: 'n', name: 'Sónia Galvão', canMinister: false, pairId: 'p' },
        { id: 'q', name: 'Paula Paz', canMinister: true, pairId: 'p', pausedUntil: '2026-12-01' },
    ];
    const pairs = [{ id: 'p', ministers: ['m1', 'm2'] }];
    const base = { sisters, pairs, templates: DEFAULT_TEMPLATES };

    test('one message per pair, names both, matches the e-mail example for one sister', () => {
        const one = pairMessages({ ...base, attendance: { '2026-11-01': ['m1', 'm2', 'y', 'n', 'q'] } }, '2026-11-01');
        expect(one.messages).toHaveLength(1);
        expect(one.messages[0].text).toBe('Olá, Manuela e Carolina! A vossa irmã Augusta hoje não esteve connosco na igreja. Durante a semana, podem dar-lhe uma palavra? Vejam se está tudo bem e partilhem com ela um pensamento, uma escritura ou algo que sentiram hoje. Obrigada pelo vosso amor!');
        const two = pairMessages({ ...base, attendance: { '2026-11-01': ['m1', 'm2', 'n', 'q'] } }, '2026-11-01');
        expect(two.messages).toHaveLength(1);
        expect(two.messages[0].text).toContain('As vossas irmãs Augusta e Rosa hoje não estiveram');
    });
    test('cannot-minister and paused sisters are skipped; 4+ raises an alert', () => {
        const a = {};
        ['2026-10-11', '2026-10-18', '2026-10-25', '2026-11-01'].forEach(d => { a[d] = ['m1', 'm2', 'x', 'y']; });
        const r = pairMessages({ ...base, attendance: a }, '2026-11-01');
        expect(r.messages).toHaveLength(0);
        expect(r.skipped.map(s => s.sister.id).sort()).toEqual(['n', 'q']);
        expect(r.alerts.map(s => s.sister.id).sort()).toEqual(['n', 'q']);
    });
    test('streak picks the 2–3 text', () => {
        const a = { '2026-10-25': ['m1', 'm2', 'y', 'n', 'q'], '2026-11-01': ['m1', 'm2', 'y', 'n', 'q'] };
        expect(pairMessages({ ...base, attendance: a }, '2026-11-01').messages[0].text).toContain('há 2 domingos');
    });
    test('mixed levels: one message, a paragraph per level, greeting once', () => {
        const a = {};
        ['2026-10-11', '2026-10-18', '2026-10-25'].forEach(d => { a[d] = ['m1', 'm2', 'x', 'n', 'q']; });
        a['2026-11-01'] = ['m1', 'm2', 'n', 'q'];
        const r = pairMessages({ ...base, attendance: a }, '2026-11-01');
        expect(r.messages).toHaveLength(1);
        const t = r.messages[0].text;
        expect(t.match(/Olá, Manuela e Carolina!/g)).toHaveLength(1);
        expect(t).toContain('A vossa irmã Rosa não vem à igreja há 4 domingos');
        expect(t).toContain('A vossa irmã Augusta hoje não esteve');
        expect(t.indexOf('Rosa')).toBeLessThan(t.indexOf('Augusta'));
    });
    test('unsaved Sunday gives nothing', () => {
        expect(pairMessages({ ...base, attendance: {} }, '2026-11-01').messages).toEqual([]);
    });
});

describe('birthdays and project', () => {
    const people = [
        { id: 'a', name: 'A', birth: '1941-11-03' },
        { id: 'b', name: 'B', birth: '1990-11-20' },
        { id: 'c', name: 'C', birth: '1950-11-10' },
        { id: 'd', name: 'D', birth: '1944-12-01' },
        { id: 'e', name: 'E', birth: '1948-02-29' },
    ];
    test('age and leap-day birthdays', () => {
        expect(ageOn('1941-11-03', '2026-11-03')).toBe(85);
        expect(ageOn('1941-11-03', '2026-11-02')).toBe(84);
        expect(birthdayIn('1948-02-29', 2026)).toBe('2026-02-28');
    });
    test('month list sorted by day', () => {
        expect(birthdaysInMonth(people, '2026-11').map(b => b.person.id)).toEqual(['a', 'c', 'b']);
    });
    test('project: min age + rotation continuing across months', () => {
        const orgs = ['Primária', 'Moças', 'Rapazes'];
        const nov = projectAssignments(people, '2026-11', 70, orgs, projectOffset(people, '2026-11', 70, '2026-11'));
        expect(nov.map(a => [a.person.id, a.org])).toEqual([['a', 'Primária'], ['c', 'Moças']]);
        const dec = projectAssignments(people, '2026-12', 70, orgs, projectOffset(people, '2026-12', 70, '2026-11'));
        expect(dec.map(a => [a.person.id, a.org])).toEqual([['d', 'Rapazes']]);
    });
});

describe('seed', () => {
    test('fictitious data has every case the test page needs', () => {
        const db = seed(new Date(2026, 10, 3));
        const last = '2026-11-01';
        expect(db.attendance[last]).toBeUndefined();
        expect(db.draft[last].length).toBeGreaterThan(10);
        db.attendance[last] = db.draft[last];
        const r = pairMessages(db, last);
        const streaks = r.messages.flatMap(m => m.absentees.map(a => a.streak));
        expect(streaks).toContain(1);
        expect(streaks.some(s => s >= 2 && s <= 3)).toBe(true);
        expect(r.alerts.length).toBeGreaterThan(0);
        expect(r.skipped.length).toBeGreaterThan(0);
        expect(db.sisters.every(s => /^900 00/.test(s.phone))).toBe(true);
        expect(iso(new Date(2026, 10, 3))).toBe('2026-11-03');
    });
});
