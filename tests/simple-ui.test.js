/**
 * @jest-environment jsdom
 */
import { toMeeting } from '../js/simple-ui.js';

describe('simple-ui toMeeting adapter', () => {
    test('maps form fields and split speakers to the shared meeting shape', () => {
        document.body.innerHTML = `
            <form id="f">
                <input name="ward" value="Ala Alvalade"><input name="date" value="2026-09-14">
                <input name="presiding" value="Bispo X"><input name="conducting" value="Cons. Y">
                <input name="organist" value="O"><input name="chorister" value="R">
                <input name="openingHymn" value="78 - A"><input name="sacramentHymn" value="112 - B">
                <input name="intermediateHymn" value=""><input name="closingHymn" value="34 - C">
                <input name="invocation" value="P1"><input name="benediction" value="P2">
                <input type="checkbox" name="fastMeeting">
            </form>`;
        const form = document.getElementById('f');
        const st = {
            recognitions: [{ id: '1', text: 'R' }], announcements: [], releases: [{ id: '2', name: 'N', calling: 'C' }], callings: [],
            speakersBefore: [{ id: 'a', name: 'A' }], speakersAfter: [{ id: 'b', name: 'B' }],
        };
        const m = toMeeting(form, st);
        expect(m).toMatchObject({ ward_name: 'Ala Alvalade', date: '2026-09-14', kind: 'normal', opening_hymn: '78 - A', invocation: 'P1' });
        expect(m.program).toEqual([
            { type: 'speaker', id: 'a', name: 'A', position: 'before' },
            { type: 'speaker', id: 'b', name: 'B', position: 'after' },
        ]);
        form.elements.namedItem('fastMeeting').checked = true;
        expect(toMeeting(form, st).kind).toBe('fast');
    });
});
