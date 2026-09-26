import { buildAbsenceHistory, dayState, absenceStreak } from '../js/utils/absences.js';

describe('absence history', () => {
    const rows = [
        { meeting_date: '2026-09-06', member_id: 'a' },
        { meeting_date: '2026-09-13', member_id: 'a' },
        { meeting_date: '2026-09-13', member_id: 'b' },
    ];

    test('nothing is assumed: a Sunday with no marks has no data', () => {
        const h = buildAbsenceHistory([], '2026-09-20');
        expect(h.dates).toEqual(['2026-09-20']);
        expect(dayState(h, 'a', '2026-09-20')).toBe('nodata');
        expect(absenceStreak(h, 'a')).toBe(0);
    });

    test('recorded Sundays show absent/present; streak skips Sundays without data', () => {
        const h = buildAbsenceHistory(rows, '2026-09-20');
        expect(h.dates).toEqual(['2026-09-20', '2026-09-13', '2026-09-06']);
        expect(dayState(h, 'b', '2026-09-06')).toBe('present');
        expect(dayState(h, 'a', '2026-09-20')).toBe('nodata');
        expect(absenceStreak(h, 'a')).toBe(2);
        expect(absenceStreak(h, 'b')).toBe(1);
    });

    test('marks on the Sunday on screen make it recorded and count', () => {
        const h = buildAbsenceHistory(rows, '2026-09-20', new Set(['a']));
        expect(dayState(h, 'a', '2026-09-20')).toBe('absent');
        expect(dayState(h, 'b', '2026-09-20')).toBe('present');
        expect(absenceStreak(h, 'a')).toBe(3);
        expect(absenceStreak(h, 'b')).toBe(0);
    });
});
