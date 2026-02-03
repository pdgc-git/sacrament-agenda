document.addEventListener('DOMContentLoaded', () => {
    // === State Management ===
    const state = {
        recognitions: [],
        releases: [],      // New: desobrigações
        callings: [],      // Changed: only chamados (apoios)
        announcements: [],
        speakers: [], // Objects: { id, name, type: 'speaker'|'hymn' }
        fastMeeting: false
    };

    // Helper to identify dynamic fields
    const dynamicFields = ['recognitions', 'releases', 'callings', 'announcements', 'speakers'];

    // === Initialization ===
    const form = document.getElementById('agendaForm');
    const inputs = form.querySelectorAll('input:not(.hymn-search), textarea');

    // Bind static inputs
    inputs.forEach(input => {
        if (input.name === 'fastMeeting') {
            input.addEventListener('change', (e) => toggleFastMeeting(e.target.checked));
        } else {
            // Initial sync
            updatePreview(input);
            input.addEventListener('input', (e) => updatePreview(e.target));
        }
    });

    // Initialize Hymn Searchers
    const hymnInputs = document.querySelectorAll('.hymn-search');
    hymnInputs.forEach(setupHymnSearch);

    // Initial Render of Dynamic Lists (Empty)
    // renderDynamicList('recognitions');
    // renderDynamicList('callings');
    // renderDynamicList('announcements');
    // renderSpeakersInput();

    // === Core Logic ===

    function toggleFastMeeting(isFast) {
        state.fastMeeting = isFast;

        // UI Updates
        const interHymnWrapper = document.getElementById('intermediate-hymn-wrapper');
        const fastNote = document.getElementById('fast-meeting-note');
        // Controls to hide
        const addSpeakerBtn = document.querySelector('button[onclick="addSpeaker()"]');
        const speakersContainer = document.getElementById('speakers-input-container');

        if (isFast) {
            interHymnWrapper.style.display = 'none';
            if (addSpeakerBtn) addSpeakerBtn.style.display = 'none';
            if (speakersContainer) speakersContainer.style.display = 'none';

            fastNote.style.display = 'block';
        } else {
            interHymnWrapper.style.display = 'block';
            if (addSpeakerBtn) addSpeakerBtn.style.display = 'block';
            if (speakersContainer) speakersContainer.style.display = 'flex'; // Restore flex from css class

            fastNote.style.display = 'none';
        }

        // Re-render speakers output to reflect changes (e.g. hiding intermediate hymn in output)
        renderSpeakersOutput();
    }

    function updatePreview(input) {
        const key = input.name;
        const value = input.value;
        const bindElements = document.querySelectorAll(`[data-bind="${key}"]`);

        bindElements.forEach(el => {
            if (key === 'date') {
                if (value) {
                    const dateObj = new Date(value);
                    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
                    el.textContent = dateObj.toLocaleDateString('pt-PT', options);
                } else {
                    el.textContent = '--/--/----';
                }
            } else {
                el.textContent = value || '...';
            }
        });
    }

    // === Dynamic List Logic (Generic) ===
    window.addListItem = (type) => {
        const id = Date.now().toString();
        // For releases and callings, we need dual fields: name and calling
        if (type === 'releases' || type === 'callings') {
            state[type].push({ id, name: '', calling: '' });
        } else {
            state[type].push({ id, text: '' });
        }
        renderDynamicListInput(type);
    };

    window.removeListItem = (type, id) => {
        state[type] = state[type].filter(item => item.id !== id);
        renderDynamicListInput(type);
        renderDynamicListOutput(type);
    };

    window.updateListItem = (type, id, field, value) => {
        const item = state[type].find(i => i.id === id);
        if (item) {
            // For dual-field items (releases, callings)
            if (type === 'releases' || type === 'callings') {
                item[field] = value; // field is 'name' or 'calling'
            } else {
                item.text = value; // For single-field items, 'field' param is actually the value
            }
            renderDynamicListOutput(type);
        }
    };

    function renderDynamicListInput(type) {
        const container = document.getElementById(`${type}-input-container`);
        container.innerHTML = '';

        state[type].forEach(item => {
            const row = document.createElement('div');
            row.className = 'input-row';

            // Check if this is a dual-field type (releases or callings)
            if (type === 'releases' || type === 'callings') {
                row.innerHTML = `
                    <input type="text" value="${item.name}" 
                        oninput="updateListItem('${type}', '${item.id}', 'name', this.value)" 
                        placeholder="Nome da pessoa..." style="flex: 1;">
                    <input type="text" value="${item.calling}" 
                        oninput="updateListItem('${type}', '${item.id}', 'calling', this.value)" 
                        placeholder="Chamado..." style="flex: 1; margin-left: 0.5rem;">
                    <button class="btn-remove" onclick="removeListItem('${type}', '${item.id}')">×</button>
                `;
            } else {
                // Single field for recognitions and announcements
                row.innerHTML = `
                    <input type="text" value="${item.text}" 
                        oninput="updateListItem('${type}', '${item.id}', 'text', this.value)" 
                        placeholder="Novo item...">
                    <button class="btn-remove" onclick="removeListItem('${type}', '${item.id}')">×</button>
                `;
            }
            container.appendChild(row);
        });
    }

    function renderDynamicListOutput(type) {
        const container = document.querySelector(`[data-bind="${type}"]`); // ul
        const section = document.getElementById(`preview-${type}`); // wrapper div

        // Filter empty items
        let validItems;
        if (type === 'releases' || type === 'callings') {
            validItems = state[type].filter(i => i.name.trim().length > 0 || i.calling.trim().length > 0);
        } else {
            validItems = state[type].filter(i => i.text.trim().length > 0);
        }

        if (validItems.length === 0) {
            section.style.display = 'none';
        } else {
            section.style.display = 'block';

            // Format output differently for dual-field items
            if (type === 'releases' || type === 'callings') {
                container.innerHTML = validItems.map(i => `<li>${i.name}${i.calling ? ' - ' + i.calling : ''}</li>`).join('');
            } else {
                container.innerHTML = validItems.map(i => `<li>${i.text}</li>`).join('');
            }
        }

        // Special visibility logic for different sections
        if (type === 'recognitions') {
            // Recognitions is standalone, just show/hide itself
            section.style.display = validItems.length > 0 ? 'block' : 'none';
        } else if (type === 'announcements') {
            // Announcements is now standalone
            section.style.display = validItems.length > 0 ? 'block' : 'none';
        } else if (type === 'releases' || type === 'callings') {
            // Business section visibility depends on both releases AND callings
            const releasesHasItems = state.releases.some(i => i.name.trim().length > 0 || i.calling.trim().length > 0);
            const callingsHasItems = state.callings.some(i => i.name.trim().length > 0 || i.calling.trim().length > 0);

            const businessContainer = document.getElementById('preview-business');
            if (releasesHasItems || callingsHasItems) {
                businessContainer.style.display = 'block';
            } else {
                businessContainer.style.display = 'none';
            }
        }
    }

    // === Speaker Logic (Refactored for Reordering) ===

    // Add Speaker
    window.addSpeaker = () => {
        state.speakers.push({ id: Date.now().toString(), type: 'speaker', text: '' });
        renderSpeakersInput();
        renderSpeakersOutput();
    };

    // Add Intermediate Hymn to List
    window.addProgramHymn = () => {
        state.speakers.push({ id: Date.now().toString(), type: 'hymn', text: '' });
        renderSpeakersInput();
        renderSpeakersOutput();
    };

    window.removeSpeaker = (id) => {
        state.speakers = state.speakers.filter(s => s.id !== id);
        renderSpeakersInput();
        renderSpeakersOutput();
    };

    window.updateSpeaker = (id, value) => {
        const s = state.speakers.find(i => i.id === id);
        if (s) {
            s.text = value;
            renderSpeakersOutput();
        }
    }

    window.moveSpeaker = (id, direction) => {
        const index = state.speakers.findIndex(s => s.id === id);
        if (index < 0) return;

        const newIndex = index + direction;
        if (newIndex >= 0 && newIndex < state.speakers.length) {
            // Swap
            [state.speakers[index], state.speakers[newIndex]] = [state.speakers[newIndex], state.speakers[index]];
            renderSpeakersInput();
            renderSpeakersOutput();
        }
    };

    function renderSpeakersInput() {
        const container = document.getElementById('speakers-input-container');
        container.innerHTML = '';

        state.speakers.forEach((item, index) => {
            const row = document.createElement('div');
            row.className = 'input-row speaker-row';

            const isHymn = item.type === 'hymn';
            const placeholder = isHymn ? 'Hino (Número - Título)' : 'Orador / Item...';
            const extraClass = isHymn ? 'hymn-input-row' : '';

            // For hymn inputs, enable search behavior?
            // We need to attach the search listener if it's a hymn.
            // But simple input for now is safer to avoid complex re-binding on re-render.
            // We'll mark it with a class and attach listeners after? No, let's keep it simple text for now
            // OR use the existing helper if we can.

            row.innerHTML = `
                <div class="speaker-order-controls">
                    <button class="btn-move" onclick="moveSpeaker('${item.id}', -1)">▲</button>
                    <button class="btn-move" onclick="moveSpeaker('${item.id}', 1)">▼</button>
                </div>
                <div style="flex: 1; position: relative;" class="${isHymn ? 'hymn-input-wrapper' : ''}">
                    ${isHymn ? '<span style="font-size: 0.7rem; color: #666; display: block; margin-bottom: 2px;">Hino Intermediário / Especial</span>' : ''}
                    <input type="text" value="${item.text}" 
                        class="${isHymn ? 'hymn-searchable-dynamic' : ''}"
                        oninput="updateSpeaker('${item.id}', this.value)" 
                        placeholder="${placeholder}">
                     ${isHymn ? '<div class="hymn-results"></div>' : ''}
                </div>
                <button class="btn-remove" onclick="removeSpeaker('${item.id}')">×</button>
            `;
            container.appendChild(row);

            // If it's a hymn, attach search logic
            if (isHymn) {
                const input = row.querySelector('input');
                setupHymnSearch(input, (val) => updateSpeaker(item.id, val));
            }
        });
    }

    function renderSpeakersOutput() {
        const container = document.getElementById('speakers-list');
        container.innerHTML = '';

        const speakers = state.speakers.filter(s => s.text.trim());

        speakers.forEach((item) => {
            if (item.type === 'hymn') {
                const hDiv = document.createElement('div');
                hDiv.className = 'program-item highlight-box';
                hDiv.innerHTML = `
                    <span class="program-label">Hino Intermediário</span>
                    <span class="program-value hymn">${item.text}</span>
                `;
                container.appendChild(hDiv);
            } else {
                const li = document.createElement('div');
                li.className = 'program-item';

                let label = `Orador`;
                let val = item.text;
                if (val.includes('-')) {
                    const parts = val.split('-');
                    label = parts[0].trim();
                    val = parts.slice(1).join('-').trim();
                }

                li.innerHTML = `
                    <span class="program-label">${label}</span>
                    <span class="program-value">${val}</span>
                `;
                container.appendChild(li);
            }
        });
    }

    // === Hymn Search Logic (Updated) ===
    function setupHymnSearch(input, callback) {
        const wrapper = input.parentElement;
        const resultsBox = wrapper.querySelector('.hymn-results');
        if (!resultsBox) return; // Guard

        input.addEventListener('input', () => {
            filterHymns(input.value, resultsBox, input, callback);
            // If main callback not provided, use default update
            if (!callback) updatePreview(input);
        });

        // Hide on outside click handled globally, but we need to ensure unique handling
        // ... handled by global click listener theoretically if wrapped correctly
    }

    function filterHymns(query, resultsBox, inputField, callback) {
        if (!query) {
            resultsBox.style.display = 'none';
            return;
        }

        const q = query.toLowerCase();
        // Use window.hymns
        if (!window.hymns) return;

        let matches = window.hymns.filter(h => {
            return h.number.toString() === q || h.title.toLowerCase().includes(q) || h.number.toString().startsWith(q);
        });

        matches = matches.slice(0, 10);

        if (matches.length === 0) {
            resultsBox.style.display = 'none';
            return;
        }

        resultsBox.innerHTML = '';
        matches.forEach(h => {
            const div = document.createElement('div');
            div.className = 'hymn-result-item';
            div.textContent = `${h.number} - ${h.title}`;
            div.onclick = () => {
                const val = `${h.number} - ${h.title}`;
                inputField.value = val;
                resultsBox.style.display = 'none';

                if (callback) {
                    callback(val);
                    renderSpeakersOutput(); // force re-render to update UI
                } else {
                    updatePreview(inputField);
                }
            };
            resultsBox.appendChild(div);
        });

        resultsBox.style.display = 'block';
    }
});

// === Export PDF ===
async function exportPDF() {
    const element = document.getElementById('agenda-paper');

    // Get date for filename
    const dateInput = document.querySelector('input[name="date"]');
    const dateValue = dateInput ? dateInput.value : '';
    const filename = dateValue ? `agenda_sacramental_${dateValue}.pdf` : 'agenda_sacramental.pdf';

    // Config for html2pdf
    const opt = {
        margin: 0,
        filename: filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
    };

    // If on mobile/share-capable device, try to share the blob directly
    if (navigator.canShare && navigator.share) {
        try {
            const worker = html2pdf().set(opt).from(element);
            const blob = await worker.output('blob');
            const file = new File([blob], filename, { type: 'application/pdf' });

            if (navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: 'Agenda Sacramental',
                    text: `Agenda para ${dateValue}`,
                });
                return; // Shared!
            }
        } catch (err) {
            console.log('Share failed or cancelled, falling back to download', err);
        }
    }

    // Fallback or Desktop: Direct Download
    html2pdf(element, opt);
}
