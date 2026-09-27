import {
    toIsoDate, parseIsoDate, nextSunday, sundaysFrom, formatDateLong, formatAgo, speakersBefore, speakersAfter,
    blankMeeting, missingItems, balance, formatBalance, hymnNumber, hymnTitle, buildActivity, memberAvailability, applyWardDefaults, missingCounts, formatMissing, newSpeaker,
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

    test('hymnTitle drops the leading number and separator', () => {
        expect(hymnTitle('112 - Sim, Eu Te Sigo')).toBe('Sim, Eu Te Sigo');
        expect(hymnTitle('101 Deus, Escuta-nos Orar')).toBe('Deus, Escuta-nos Orar');
        expect(hymnTitle('Sem número')).toBe('Sem número');
        expect(hymnTitle('')).toBe('');
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

describe('meeting utils — activity', () => {
    const today = new Date(2026, 8, 26);
    const rows = [
        { date: '2025-06-01', program: [{ type: 'speaker', member_id: 'a', topic: 'Fé' }], invocation_member_id: 'b' },
        { date: '2026-03-08', program: [{ type: 'speaker', member_id: 'a', topic: 'Oração' }, { type: 'hymn', name: '134' }], benediction_member_id: 'b' },
        { date: '2026-09-20', program: [{ type: 'speaker', member_id: 'a', topic: 'Dízimo' }, { type: 'speaker', member_id: null, name: 'Elder X' }] },
    ];
    test('counts talks in the last 12 months and keeps the latest topic', () => {
        const { talks } = buildActivity(rows, today);
        expect(talks.get('a')).toEqual({ count12: 2, last: '2026-09-20', lastTopic: 'Dízimo' });
        expect(talks.size).toBe(1); // visitors (no member_id) are not counted
    });
    test('counts prayers from both prayer slots', () => {
        const { prayers } = buildActivity(rows, today);
        expect(prayers.get('b')).toEqual({ count12: 1, last: '2026-03-08' });
    });
});

describe('meeting utils — member availability', () => {
    const today = new Date(2026, 8, 26);
    test('moved and away are reported, active is the default', () => {
        expect(memberAvailability({ status: 'moved' }, today)).toBe('moved');
        expect(memberAvailability({ status: 'away' }, today)).toBe('away');
        expect(memberAvailability({}, today)).toBe('active');
    });
    test('away ends by itself after away_until', () => {
        expect(memberAvailability({ status: 'away', away_until: '2026-09-26' }, today)).toBe('away');
        expect(memberAvailability({ status: 'away', away_until: '2026-09-25' }, today)).toBe('active');
    });
});

describe('meeting utils — ward defaults on saved meetings', () => {
    const settings = { presiding: 'Paulo Costa', conducting_rotation: ['Francisco Tavares', 'Wilson Pires'], organist: 'Elder Mosley', chorister: 'Lucília Soares' };
    test('fills only the empty fields of a draft, conducting from the rotation', () => {
        const m = applyWardDefaults({ date: '2026-10-11', status: 'draft', presiding: '', conducting: null, organist: 'Outra Pessoa' }, settings, 1);
        expect(m).toMatchObject({ presiding: 'Paulo Costa', conducting: 'Wilson Pires', organist: 'Outra Pessoa', chorister: 'Lucília Soares' });
    });
    test('leaves finished meetings alone', () => {
        const m = applyWardDefaults({ date: '2026-09-20', status: 'completed', presiding: '' }, settings, 0);
        expect(m.presiding).toBe('');
    });
});

describe('meeting utils — missing by kind', () => {
    test('counts speakers not confirmed, prayers and the three required hymns', () => {
        const m = { kind: 'normal', program: [{ type: 'speaker', name: 'A', invite_status: 'confirmed' }, { type: 'speaker', name: '', invite_status: 'to_ask' }, { type: 'speaker', name: 'B', invite_status: 'asked' }],
            invocation: 'X', benediction: '', opening_hymn: '2 - Tal Como um Facho', sacrament_hymn: '', closing_hymn: '' };
        expect(missingCounts(m)).toEqual({ speakers: 2, prayers: 1, hymns: 2 });
        expect(formatMissing(missingCounts(m))).toBe('2 oradores, 1 oração, 2 hinos');
        expect(formatMissing(missingCounts(m), 'hymns')).toBe('2 hinos');
    });
    test('fast Sundays have no speakers to find; conferences have nothing', () => {
        expect(missingCounts({ kind: 'fast', program: [{ type: 'speaker', name: '' }] }).speakers).toBe(0);
        expect(missingCounts({ kind: 'conference' })).toEqual({ speakers: 0, prayers: 0, hymns: 0 });
    });
});
