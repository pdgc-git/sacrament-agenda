/**
 * @jest-environment jsdom
 */

// Mock HTML structure needed for app.js
const mockHTML = `
    <form id="agendaForm">
        <input type="checkbox" name="fastMeeting" id="fastMeeting">
        <div id="intermediate-hymn-wrapper"></div>
        <div id="fast-meeting-note" style="display:none"></div>
        <button onclick="addSpeaker()">Add Speaker</button>
        <div id="speakers-input-container"></div>
        <div id="speakers-list"></div>
        
        <input type="text" name="date" data-bind="date">
        <span data-bind="date"></span>
        
        <!-- Dynamic Lists -->
        <div id="recognitions-input-container"></div>
        <ul data-bind="recognitions"></ul>
        <div id="preview-recognitions"></div>
    </form>
`;

describe('App UI Logic', () => {
    let state;

    beforeEach(() => {
        document.body.innerHTML = mockHTML;
        jest.resetModules();

        // Mock global window functions that app.js expects or creates
        window.addSpeaker = jest.fn();

        // Load app.js (this will run the DOMContentLoaded listener setup)
        require('../app.js');

        // Trigger DOMContentLoaded manually
        document.dispatchEvent(new Event('DOMContentLoaded'));
    });

    test('toggleFastMeeting should update UI elements', () => {
        const checkbox = document.getElementById('fastMeeting');
        const interHymn = document.getElementById('intermediate-hymn-wrapper');
        const fastNote = document.getElementById('fast-meeting-note');

        // Initial state (checked=false) defined in HTML

        // Simulate check
        checkbox.checked = true;
        checkbox.dispatchEvent(new Event('change'));

        // Check UI updates
        expect(interHymn.style.display).toBe('none');
        expect(fastNote.style.display).toBe('block');

        // Simulate uncheck
        checkbox.checked = false;
        checkbox.dispatchEvent(new Event('change'));

        expect(interHymn.style.display).toBe('block');
        expect(fastNote.style.display).toBe('none');
    });

    test('addListItem should add item to global window functions and update UI', () => {
        // Since app.js defines window.addListItem inside DOMContentLoaded, 
        // it should be available now.
        expect(typeof window.addListItem).toBe('function');

        // This test assumes access to internal state which we don't have directly.
        // But we can check side effects on the DOM (renderDynamicListInput).

        window.addListItem('recognitions');

        const container = document.getElementById('recognitions-input-container');
        expect(container.children.length).toBe(1);
        expect(container.innerHTML).toContain('input-row');
    });
});
