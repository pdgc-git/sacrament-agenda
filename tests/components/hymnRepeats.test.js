/**
 * @jest-environment jsdom
 */
jest.mock('../../js/app-state.js', () => ({
    state: { settings: { hymn_repeat_months: 3 }, hymnLastSung: new Map([['25', '2026-09-20'], ['46', '2026-08-02']]) },
}));
jest.mock('../../js/components/picker.js', () => ({ openMemberPicker: jest.fn(), openHymnPicker: jest.fn() }));
jest.mock('../../js/hymns.js', () => ({ hymns: [] }));

import { hymnRepeats } from '../../js/components/assign.js';

describe('hymnRepeats', () => {
    test('a meeting does not warn about its own hymns', () => {
        expect(hymnRepeats('25 - Bela Sião', '2026-09-20')).toBe(false);
    });
    test('warns inside the window before the meeting, measured from the meeting date', () => {
        expect(hymnRepeats('25 - Bela Sião', '2026-10-11')).toBe(true);
        expect(hymnRepeats('46 - Nossas Vozes Elevemos', '2026-12-20')).toBe(false);
    });
    test('never sung, or no number, never warns', () => {
        expect(hymnRepeats('101 - Deus, Escuta-nos Orar', '2026-10-11')).toBe(false);
        expect(hymnRepeats('', '2026-10-11')).toBe(false);
    });
});
