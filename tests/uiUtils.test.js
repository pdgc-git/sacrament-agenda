/**
 * @jest-environment jsdom
 */

import { setupHymnSearch } from '../js/utils/uiUtils.js';

describe('setupHymnSearch', () => {
    let input;
    let wrapper;
    let hymns;

    beforeEach(() => {
        // Setup DOM
        document.body.innerHTML = `
            <div class="wrapper">
                <input type="text" class="hymn-input" />
            </div>
        `;
        wrapper = document.querySelector('.wrapper');
        input = document.querySelector('.hymn-input');

        hymns = [
            { number: 1, title: 'The Morning Breaks' },
            { number: 2, title: 'The Spirit of God' },
            { number: 85, title: 'How Firm a Foundation' },
            { number: 134, title: 'I Believe in Christ' },
            { number: 200, title: 'Christ the Lord Is Risen Today' },
            { number: 300, title: 'Praise to the Man' }
        ];
    });

    afterEach(() => {
        document.body.innerHTML = '';
        jest.clearAllMocks();
    });

    test('creates resultsBox and warningEl if they do not exist', () => {
        setupHymnSearch(input, hymns);

        const resultsBox = wrapper.querySelector('.hymn-results');
        const warningEl = wrapper.querySelector('.warning-text');

        expect(resultsBox).not.toBeNull();
        expect(resultsBox.tagName.toLowerCase()).toBe('div');

        expect(warningEl).not.toBeNull();
        expect(warningEl.tagName.toLowerCase()).toBe('div');
    });

    test('reuses existing resultsBox and warningEl if they exist', () => {
        // Create them beforehand
        const existingResults = document.createElement('div');
        existingResults.className = 'hymn-results';
        existingResults.id = 'existing-results';
        wrapper.appendChild(existingResults);

        const existingWarning = document.createElement('div');
        existingWarning.className = 'warning-text';
        existingWarning.id = 'existing-warning';
        wrapper.appendChild(existingWarning);

        setupHymnSearch(input, hymns);

        const resultsBoxes = wrapper.querySelectorAll('.hymn-results');
        const warningEls = wrapper.querySelectorAll('.warning-text');

        expect(resultsBoxes.length).toBe(1);
        expect(resultsBoxes[0].id).toBe('existing-results');

        expect(warningEls.length).toBe(1);
        expect(warningEls[0].id).toBe('existing-warning');
    });

    test('dispatches hymn-focus event on input focus', () => {
        setupHymnSearch(input, hymns);

        const focusListener = jest.fn();
        input.addEventListener('hymn-focus', focusListener);

        input.dispatchEvent(new Event('focus'));

        expect(focusListener).toHaveBeenCalledTimes(1);
        expect(focusListener.mock.calls[0][0].bubbles).toBe(true);
    });

    test('shows matching hymns by title and number, limited to 5', () => {
        setupHymnSearch(input, hymns);
        const resultsBox = wrapper.querySelector('.hymn-results');

        // Test matching by title
        input.value = 'Christ';
        input.dispatchEvent(new Event('input'));

        expect(resultsBox.style.display).toBe('block');
        let items = resultsBox.querySelectorAll('.hymn-result-item');
        expect(items.length).toBe(2);
        // Using innerText in jsdom can sometimes be tricky or missing depending on version,
        // let's check textContent which is a standard property that jsdom supports reliably.
        // Wait, the source code uses `row.innerText = ...`. In jsdom `innerText` doesn't always populate `textContent` synchronously.
        // Let's check `innerText` or `textContent`.
        expect(items[0].innerText || items[0].textContent).toBe('134 - I Believe in Christ');
        expect(items[1].innerText || items[1].textContent).toBe('200 - Christ the Lord Is Risen Today');

        // Test matching by number
        input.value = '2';
        input.dispatchEvent(new Event('input'));

        expect(resultsBox.style.display).toBe('block');
        items = resultsBox.querySelectorAll('.hymn-result-item');
        expect(items.length).toBe(2);
        expect(items[0].innerText || items[0].textContent).toBe('2 - The Spirit of God');
        expect(items[1].innerText || items[1].textContent).toBe('200 - Christ the Lord Is Risen Today');

        // Add more matching hymns to test limit
        const moreHymns = [
            ...hymns,
            { number: 201, title: 'Christ 1' },
            { number: 202, title: 'Christ 2' },
            { number: 203, title: 'Christ 3' },
            { number: 204, title: 'Christ 4' }
        ];

        setupHymnSearch(input, moreHymns);
        input.value = 'Christ';
        input.dispatchEvent(new Event('input'));

        items = resultsBox.querySelectorAll('.hymn-result-item');
        expect(items.length).toBe(5); // Only 5 items max
    });

    test('hides results box when input is empty or no matches', () => {
        setupHymnSearch(input, hymns);
        const resultsBox = wrapper.querySelector('.hymn-results');

        // Empty input
        input.value = '';
        input.dispatchEvent(new Event('input'));
        expect(resultsBox.style.display).toBe('none');

        // No matches
        input.value = 'Nonexistent Hymn';
        input.dispatchEvent(new Event('input'));
        expect(resultsBox.style.display).toBe('none');
    });

    test('clicking a result updates input, hides box, calls onSelect, and dispatches event', () => {
        const onSelect = jest.fn();
        setupHymnSearch(input, hymns, onSelect);
        const resultsBox = wrapper.querySelector('.hymn-results');

        // Trigger search
        input.value = 'Spirit';
        input.dispatchEvent(new Event('input'));

        const item = resultsBox.querySelector('.hymn-result-item');
        expect(item).not.toBeNull();

        const customEventListener = jest.fn();
        input.addEventListener('hymn-selected', customEventListener);

        // Click the result
        item.onclick();

        expect(input.value).toBe('2 - The Spirit of God');
        expect(resultsBox.style.display).toBe('none');

        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(onSelect).toHaveBeenCalledWith('2 - The Spirit of God');

        expect(customEventListener).toHaveBeenCalledTimes(1);
        expect(customEventListener.mock.calls[0][0].detail).toEqual({ number: 2 });
    });

    test('clicking a result dispatches input event if onSelect is not provided', () => {
        setupHymnSearch(input, hymns); // No onSelect provided
        const resultsBox = wrapper.querySelector('.hymn-results');

        const inputListener = jest.fn();
        input.addEventListener('input', inputListener);

        // Trigger search
        input.value = 'Breaks';
        input.dispatchEvent(new Event('input')); // This triggers the listener once

        const item = resultsBox.querySelector('.hymn-result-item');

        // Reset mock to ignore the initial search input event
        inputListener.mockClear();

        // Click the result
        item.onclick();

        expect(inputListener).toHaveBeenCalledTimes(1); // Dispatched from onclick
    });

    test('clicking outside wrapper hides results box', () => {
        setupHymnSearch(input, hymns);
        const resultsBox = wrapper.querySelector('.hymn-results');

        // Trigger search to show box
        input.value = 'The';
        input.dispatchEvent(new Event('input'));
        expect(resultsBox.style.display).toBe('block');

        // Click inside wrapper shouldn't hide it (handled by other logic if needed, but the event listener is on document)
        // Wait, the event listener checks `!wrapper.contains(e.target)`

        // Click outside wrapper
        const outsideElement = document.createElement('div');
        document.body.appendChild(outsideElement);

        // Dispatch click on the outside element
        document.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        // Note: we can mock e.target for custom events, or rely on proper DOM structure.
        // Let's create an event and set its target.
        const event = new Event('click');
        Object.defineProperty(event, 'target', { value: outsideElement, enumerable: true });
        document.dispatchEvent(event);

        expect(resultsBox.style.display).toBe('none');
    });

    test('clears warning text on input', () => {
        setupHymnSearch(input, hymns);
        const warningEl = wrapper.querySelector('.warning-text');

        warningEl.innerHTML = 'Some warning';

        input.value = 'Test';
        input.dispatchEvent(new Event('input'));

        expect(warningEl.innerHTML).toBe('');
    });
});
