import { rankMembers, rankHymns, guestName } from '../js/components/picker.js';

const members = [
    { id: 'a', name: 'Ana Ferreira', gender: 'F', group: 'Adult' },
    { id: 'b', name: 'Bruno Costa', gender: 'M', group: 'Adult' },
    { id: 'c', name: 'Carla Reis', gender: 'F', group: 'Youth' },
    { id: 'd', name: 'Daniel Lopes', gender: 'M', group: 'Young Adult' },
    { id: 'e', name: 'Eva Pinto', gender: 'F', group: 'Youth' },
];
const today = new Date(2026, 8, 14);
const lastTalk = new Map([
    ['a', '2026-06-01'],   // 3.5 months
    ['b', '2026-09-01'],   // 2 weeks (recent)
    ['c', '2025-10-01'],   // 11 months
    // d never spoke
    ['e', '2026-08-30'],
]);

describe('rankMembers', () => {
    test('never-spoke first, then oldest talk first', () => {
        const ids = rankMembers(members, lastTalk, {}, { today }).map(r => r.member.id);
        expect(ids).toEqual(['d', 'c', 'a', 'e', 'b']);
    });

    test('filters by gender and group', () => {
        expect(rankMembers(members, lastTalk, { gender: 'F' }, { today }).map(r => r.member.id)).toEqual(['c', 'a', 'e']);
        expect(rankMembers(members, lastTalk, { groups: new Set(['Youth']) }, { today }).map(r => r.member.id)).toEqual(['c', 'e']);
        expect(rankMembers(members, lastTalk, { gender: 'F', groups: new Set(['Youth']) }, { today }).map(r => r.member.id)).toEqual(['c', 'e']);
    });

    test('search filters by name, case-insensitive', () => {
        expect(rankMembers(members, lastTalk, { search: 'PIN' }, { today }).map(r => r.member.id)).toEqual(['e']);
    });

    test('excludes already-booked members and pushes decliners last, flags recent', () => {
        const r = rankMembers(members, lastTalk, {}, { today, excludeIds: new Set(['a']), declinedIds: new Set(['d']), recentDays: 90 });
        expect(r.map(x => x.member.id)).toEqual(['c', 'e', 'b', 'd']);
        expect(r.find(x => x.member.id === 'b').recent).toBe(true);
        expect(r.find(x => x.member.id === 'c').recent).toBe(false);
        expect(r.find(x => x.member.id === 'd').declined).toBe(true);
    });
});

describe('rankHymns', () => {
    const hymns = [{ number: '1', title: 'A Alva Rompe' }, { number: '2', title: 'Tal Como um Facho' }, { number: '112', title: 'Sim, Eu Te Sigo' }];
    const lastSung = new Map([['1', '2026-09-01'], ['112', '2026-01-10']]);

    test('never-sung first, then oldest; recent flagged within the repeat window', () => {
        const r = rankHymns(hymns, lastSung, { today, repeatMonths: 3 });
        expect(r.map(x => x.hymn.number)).toEqual(['2', '112', '1']);
        expect(r.find(x => x.hymn.number === '1').recent).toBe(true);
        expect(r.find(x => x.hymn.number === '112').recent).toBe(false);
    });

    test('search by number prefix or title keeps hymnal order', () => {
        expect(rankHymns(hymns, lastSung, { today, search: '1' }).map(x => x.hymn.number)).toEqual(['1', '112']);
        expect(rankHymns(hymns, lastSung, { today, search: 'facho' }).map(x => x.hymn.number)).toEqual(['2']);
    });
});

describe('guestName', () => {
    const members = [{ id: '1', name: 'Ana Ferreira' }];
    test('offers the typed name, tidied, for someone outside the roster', () => {
        expect(guestName('  Presidente   Duarte ', members)).toBe('Presidente Duarte');
    });
    test('offers nothing for empty/one-letter input or an exact roster match', () => {
        expect(guestName('', members)).toBeNull();
        expect(guestName('a', members)).toBeNull();
        expect(guestName('ana ferreira', members)).toBeNull();
    });
});
