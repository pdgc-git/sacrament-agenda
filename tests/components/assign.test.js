/**
 * @jest-environment jsdom
 */
jest.mock('../../js/app-state.js', () => ({ state: { settings: {}, members: [], membersById: new Map(), hymnLastSung: new Map(), activity: { talks: new Map(), prayers: new Map() } } }));
jest.mock('../../js/components/picker.js', () => ({ openMemberPicker: jest.fn(), openHymnPicker: jest.fn() }));
jest.mock('../../js/hymns.js', () => ({ hymns: [] }));

import { addSpeaker, removeSpeaker } from '../../js/components/assign.js';
import { speakers } from '../../js/utils/meeting.js';

describe('removeSpeaker', () => {
    test('drops the i-th speaker and keeps hymns and the other speakers in order', () => {
        const m = { program: [] };
        addSpeaker(m); addSpeaker(m); addSpeaker(m);
        speakers(m.program).forEach((s, i) => { s.name = `S${i}`; });
        m.program.splice(1, 0, { type: 'hymn', name: '134' });
        removeSpeaker(m, 1);
        expect(speakers(m.program).map(s => s.name)).toEqual(['S0', 'S2']);
        expect(m.program.some(it => it.type === 'hymn')).toBe(true);
    });

    test('removes an empty slot and ignores an index that does not exist', () => {
        const m = { program: [] };
        addSpeaker(m);
        removeSpeaker(m, 5);
        expect(speakers(m.program)).toHaveLength(1);
        removeSpeaker(m, 0);
        expect(speakers(m.program)).toHaveLength(0);
    });
});
