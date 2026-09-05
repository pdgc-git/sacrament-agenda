import {
    toIsoDate, parseIsoDate, nextSunday, sundaysFrom, formatDateLong, formatAgo, speakersBefore, speakersAfter,
    blankMeeting, missingItems, balance, formatBalance, hymnNumber, newSpeaker,
} from '../js/utils/meeting.js';

describe('meeting utils — dates', () => {
    test('toIsoDate / parseIsoDate round-trip in local time', () => {
        expect(toIsoDate(parseIsoDate('2026-09-14'))).toBe('2026-09-14');
    });

    test('nextSunday returns the same day for a Sunday and rolls forward otherwise', () => {
        expect(toIsoDate(nextSunday(parseIsoDate('2026-09-13')))).toBe('2026-09-13'); // Sunday
        expect(toIsoDate(nextSunday(parseIsoDate('2026-09-09')))).toBe('2026-09-13'); // Wednesday
    });

    test('sundaysFrom yields consecutive Sundays', () => {
        expect(sundaysFrom(parseIsoDate('2026-09-01'), 3)).toEqual(['2026-09-06', '2026-09-13', '2026-09-20']);
    });

    test('formatDateLong matches the agenda paper wording', () => {
        expect(formatDateLong('2026-09-14')).toBe('14 de setembro de 2026');
    });

    test('formatAgo buckets', () => {
        const today = parseIsoDate('2026-09-14');
        expect(formatAgo(null, today)).toBe('nunca');
        expect(formatAgo('2026-09-12', today)).toBe('esta semana');
        expect(formatAgo('2026-08-31', today)).toBe('há 2 semanas');
        expect(formatAgo('2026-06-10', today)).toBe('há 3 meses');
        expect(formatAgo('2024-09-01', today)).toBe('há 2 anos');
    });
});

describe('meeting utils — program', () => {
    const program = [
        { type: 'speaker', name: 'A', position: 'before' },
        { type: 'speaker', name: 'B' },               // default position = before
        { type: 'speaker', name: 'C', position: 'after' },
        { type: 'hymn', name: 'x' },
    ];
    test('speakersBefore/After split by position, default before', () => {
        expect(speakersBefore(program).map(s => s.name)).toEqual(['A', 'B']);
        expect(speakersAfter(program).map(s => s.name)).toEqual(['C']);
    });

    test('blankMeeting prefills from settings and rotation', () => {
        const m = blankMeeting('2026-09-20', { presiding: 'Bispo X', conducting_rotation: ['X', 'Y', 'Z'], organist: 'O', chorister: 'R', default_speakers: 4 }, 4);
        expect(m.presiding).toBe('Bispo X');
        expect(m.conducting).toBe('Y'); // 4 % 3 = 1
        expect(m.program).toHaveLength(4);
        expect(m.program[0].invite_status).toBe('to_ask');
    });

    test('missingItems counts unassigned/unconfirmed speakers, prayers and hymns', () => {
        const m = blankMeeting('2026-09-20', { default_speakers: 2 });
        expect(missingItems(m)).toHaveLength(2 + 2 + 3);
        m.program[0] = newSpeaker({ name: 'Ana', invite_status: 'confirmed' });
        m.program[1] = newSpeaker({ name: 'Rui', invite_status: 'declined' });
        m.invocation = 'X'; m.benediction_member_id = 'id'; m.opening_hymn = '1 - A'; m.sacrament_hymn = '2 - B'; m.closing_hymn = '3 - C';
        expect(missingItems(m)).toEqual(['Rui recusou']);
    });

    test('missingItems ignores speakers on fast Sunday and everything on conference', () => {
        const m = blankMeeting('2026-09-20', {});
        m.kind = 'fast';
        expect(missingItems(m).some(x => x.includes('orador'))).toBe(false);
        m.kind = 'conference';
        expect(missingItems(m)).toEqual([]);
    });

    test('balance counts gender and youth from the roster', () => {
        const members = new Map([
            ['1', { id: '1', gender: 'M', group: 'Adult' }],
            ['2', { id: '2', gender: 'F', group: 'Youth' }],
            ['3', { id: '3', gender: 'F', group: 'Young Adult' }],
        ]);
        const b = balance([
            { name: 'a', member_id: '1' }, { name: 'b', member_id: '2' }, { name: 'c', member_id: '3' }, { name: '', member_id: null }, { name: 'guest', member_id: null },
        ], members);
        expect(b).toEqual({ men: 1, women: 2, youth: 1, youngAdults: 1, unknown: 1 });
        expect(formatBalance(b)).toBe('1H · 2M · 1 jovem');
    });

    test('hymnNumber extracts the leading number from the stored string', () => {
        expect(hymnNumber('112 - Sim, Eu Te Sigo')).toBe('112');
        expect(hymnNumber('')).toBeNull();
        expect(hymnNumber('Sem número')).toBeNull();
    });
});

describe('meeting utils — months', () => {
    test('sundaysInMonth lists every Sunday of the month', async () => {
        const { sundaysInMonth, shiftMonth } = await import('../js/utils/meeting.js');
        expect(sundaysInMonth('2026-09')).toEqual(['2026-09-06', '2026-09-13', '2026-09-20', '2026-09-27']);
        expect(sundaysInMonth('2026-11')).toEqual(['2026-11-01', '2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29']);
        expect(shiftMonth('2026-12', 1)).toBe('2027-01');
        expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    });
});
