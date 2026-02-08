
export function setupHymnSearch(input, hymns, onSelect) {
    const wrapper = input.parentElement;
    // Create Results Box if not exists
    let resultsBox = wrapper.querySelector('.hymn-results');
    if (!resultsBox) {
        resultsBox = document.createElement('div');
        resultsBox.className = 'hymn-results';
        wrapper.appendChild(resultsBox);
    }

    // Create Warning Element if not exists
    let warningEl = wrapper.querySelector('.warning-text');
    if (!warningEl) {
        warningEl = document.createElement('div');
        warningEl.className = 'warning-text';
        wrapper.appendChild(warningEl);
    }

    // Optional: Unset member focus on hymn (if needed by planner-ui, can be passed as callback or event)
    // For now we keep it generic or assume 'state' is not available here directly.
    // If strict decoupling is needed, we should dispatch an event.
    input.addEventListener('focus', () => {
        // Dispatch custom event for planner to catch
        input.dispatchEvent(new Event('hymn-focus', { bubbles: true }));
    });

    input.addEventListener('input', async () => {
        const val = input.value;
        warningEl.innerHTML = ''; // Clear warning

        // Search
        if (hymns) {
            const matches = hymns.filter(h =>
                h.number.toString().startsWith(val) || h.title.toLowerCase().includes(val.toLowerCase())
            ).slice(0, 5);

            resultsBox.innerHTML = '';
            if (matches.length > 0 && val.length > 0) {
                resultsBox.style.display = 'block';
                matches.forEach(h => {
                    const row = document.createElement('div');
                    row.className = 'hymn-result-item';
                    row.innerText = `${h.number} - ${h.title}`;
                    row.onclick = async () => {
                        const str = `${h.number} - ${h.title}`;
                        input.value = str;
                        resultsBox.style.display = 'none';
                        if (onSelect) onSelect(str);
                        else input.dispatchEvent(new Event('input')); // Trigger update

                        // Check History logic was here. 
                        // To keep this pure, we should perhaps return the selected hymn to a callback
                        // or let the parent handle history check.
                        // However, the prompt asked to extract `setupHymnSearch`.
                        // The original `setupHymnSearch` in planner.ui.js used `DM.checkHymnHistory`.
                        // We might need to pass `checkHistoryFn` as dependency or keep it in planner.
                        // For now, let's dispatch an event 'hymn-selected' with detail.

                        input.dispatchEvent(new CustomEvent('hymn-selected', { detail: { number: h.number } }));
                    };
                    resultsBox.appendChild(row);
                });
            } else { resultsBox.style.display = 'none'; }
        }
    });

    document.addEventListener('click', e => {
        if (!wrapper.contains(e.target)) resultsBox.style.display = 'none';
    });
}
