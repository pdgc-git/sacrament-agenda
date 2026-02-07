/* js/simple-ui.js */

// State for dynamic lists
const state = {
    recognitions: [],
    announcements: [],
    releases: [],
    callings: [],
    speakers: []
};

document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    setupDataBinding();
});

function setupEventListeners() {
    // Buttons
    document.getElementById('btn-add-recognition')?.addEventListener('click', () => addListItem('recognitions'));
    document.getElementById('btn-add-announcement')?.addEventListener('click', () => addListItem('announcements'));
    document.getElementById('btn-add-release')?.addEventListener('click', () => addListItem('releases'));
    document.getElementById('btn-add-calling')?.addEventListener('click', () => addListItem('callings'));
    document.getElementById('btn-add-speaker')?.addEventListener('click', () => addSpeaker());
    document.getElementById('btn-export-pdf')?.addEventListener('click', exportPDF);
    document.getElementById('fullscreen-toggle')?.addEventListener('click', toggleFullScreen);

    // Dynamic Lists (Event Delegation)
    const form = document.getElementById('agendaForm');
    form.addEventListener('click', (e) => {
        if (e.target.closest('.btn-remove')) {
            const btn = e.target.closest('.btn-remove');
            removeListItem(btn.dataset.type, btn.dataset.id);
        }
    });

    form.addEventListener('input', (e) => {
        if (e.target.classList.contains('dynamic-input')) {
            const input = e.target;
            updateListItem(input.dataset.type, input.dataset.id, input.dataset.field, input.value);
        }
    });

    // Fast Meeting Toggle
    document.getElementById('fastMeeting')?.addEventListener('change', (e) => {
        const isFast = e.target.checked;
        const speakerSection = document.getElementById('speakers-list');
        const fastNote = document.getElementById('fast-meeting-note');
        const interHymn = document.getElementById('intermediate-hymn-wrapper');

        if (isFast) {
            if (speakerSection) speakerSection.style.display = 'none';
            if (fastNote) fastNote.style.display = 'block';
            if (interHymn) interHymn.style.display = 'none';
        } else {
            if (speakerSection) speakerSection.style.display = 'block';
            if (fastNote) fastNote.style.display = 'none';
            if (interHymn) interHymn.style.display = 'block';
        }
    });

    // Hymn Search
    document.querySelectorAll('.hymn-search').forEach(input => {
        setupHymnSearch(input);
    });
}

// Simple Data Binding (Input -> Preview)
function setupDataBinding() {
    const inputs = document.querySelectorAll('input[name], textarea[name]');
    inputs.forEach(input => {
        input.addEventListener('input', () => {
            const field = input.name;
            const target = document.querySelector(`[data-bind="${field}"]`);
            if (target) {
                target.textContent = input.value;
            }
        });
    });
}

// --- List Management ---

function addListItem(type) {
    const id = crypto.randomUUID();
    const item = { id };
    if (type === 'releases' || type === 'callings') {
        item.name = '';
        item.calling = '';
    } else if (type === 'speakers') { // Helper for speaker button
        state.speakers.push({ id, name: '' });
        renderSpeakers();
        return;
    } else {
        item.text = '';
    }

    state[type].push(item);
    renderListInput(type);
    renderPreviewList(type);
}

function addSpeaker() {
    const id = crypto.randomUUID();
    state.speakers.push({ id, name: '' });
    renderSpeakers();
    renderPreviewSpeakers();
}

function removeListItem(type, id) {
    if (type === 'speakers') {
        state.speakers = state.speakers.filter(i => i.id !== id);
        renderSpeakers();
        renderPreviewSpeakers();
    } else {
        state[type] = state[type].filter(i => i.id !== id);
        renderListInput(type);
        renderPreviewList(type);
    }
}

function updateListItem(type, id, field, value) {
    if (type === 'speakers') {
        const item = state.speakers.find(i => i.id === id);
        if (item) item.name = value;
        renderPreviewSpeakers();
    } else {
        const item = state[type].find(i => i.id === id);
        if (item) {
            if (field) item[field] = value;
            else item.text = value; // Default
        }
        renderPreviewList(type);
    }
}

// --- Rendering Inputs ---

function renderListInput(type) {
    const container = document.getElementById(`${type}-input-container`);
    if (!container) return;
    container.innerHTML = '';

    state[type].forEach(item => {
        const div = document.createElement('div');
        div.className = 'input-row';

        if (type === 'releases' || type === 'callings') {
            div.innerHTML = `
                <input type="text" class="dynamic-input" placeholder="Nome" value="${item.name}" data-type="${type}" data-id="${item.id}" data-field="name" style="flex:1">
                <input type="text" class="dynamic-input" placeholder="Chamado" value="${item.calling}" data-type="${type}" data-id="${item.id}" data-field="calling" style="flex:1">
                <button class="btn-remove" data-type="${type}" data-id="${item.id}">×</button>
            `;
        } else {
            div.innerHTML = `
                <input type="text" class="dynamic-input" placeholder="Texto..." value="${item.text}" data-type="${type}" data-id="${item.id}" data-field="text" style="flex:1">
                <button class="btn-remove" data-type="${type}" data-id="${item.id}">×</button>
            `;
        }
        container.appendChild(div);
    });
}

function renderSpeakers() {
    const container = document.getElementById('speakers-input-container');
    container.innerHTML = '';
    state.speakers.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'input-row';
        div.innerHTML = `
            <label style="font-size:0.8rem; color:#666; width:20px;">${index + 1}.</label>
            <input type="text" class="dynamic-input" placeholder="Nome do Orador" value="${item.name}" data-type="speakers" data-id="${item.id}" data-field="name" style="flex:1">
            <button class="btn-remove" data-type="speakers" data-id="${item.id}">×</button>
        `;
        container.appendChild(div);
    });
}

// --- Rendering Preview ---

function renderPreviewList(type) {
    // Map type to preview ID
    const map = {
        recognitions: 'preview-recognitions',
        announcements: 'preview-announcements',
        releases: 'preview-releases',
        callings: 'preview-callings'
    };

    const containerId = map[type];
    const container = document.getElementById(containerId);
    if (!container) return;

    // Show/Hide section
    const ul = container.querySelector('ul');
    ul.innerHTML = '';

    if (state[type].length > 0) {
        container.style.display = 'block';
        if (type === 'releases' || type === 'callings') {
            // Check parent business section
            document.getElementById('preview-business').style.display = 'block';
        }

        state[type].forEach(item => {
            const li = document.createElement('li');
            if (type === 'releases' || type === 'callings') {
                li.textContent = `${item.name} (${item.calling})`;
            } else {
                li.textContent = item.text;
            }
            ul.appendChild(li);
        });
    } else {
        container.style.display = 'none';
        // Hide business parent if both empty? (Logic simplified for now)
    }
}

function renderPreviewSpeakers() {
    const list = document.getElementById('speakers-list');
    list.innerHTML = '';
    state.speakers.forEach(s => {
        const div = document.createElement('div');
        div.className = 'speaker-item';
        div.innerHTML = `<span class="program-label">Orador</span><span class="program-value">${s.name}</span>`;
        list.appendChild(div);
    });
}

// --- Utilities ---

function exportPDF() {
    const element = document.getElementById('agenda-paper');
    const opt = {
        margin: 0,
        filename: 'agenda_sacramental.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
    };
    if (window.html2pdf) {
        html2pdf().set(opt).from(element).save();
    } else {
        alert("Biblioteca PDF não carregada.");
    }
}

function toggleFullScreen() {
    document.querySelector('.app-layout').classList.toggle('full-screen');
}

function setupHymnSearch(input) {
    const resultsBox = input.parentElement.querySelector('.hymn-results');
    input.addEventListener('input', () => {
        const val = input.value.toLowerCase();
        if (val.length < 1) { resultsBox.style.display = 'none'; return; }

        if (window.hymns) {
            const matches = window.hymns.filter(h =>
                h.number.toString().startsWith(val) || h.title.toLowerCase().includes(val)
            ).slice(0, 5);

            resultsBox.innerHTML = '';
            if (matches.length > 0) {
                resultsBox.style.display = 'block';
                matches.forEach(h => {
                    const div = document.createElement('div');
                    div.className = 'hymn-result-item';
                    div.textContent = `${h.number} - ${h.title}`;
                    div.onclick = () => {
                        input.value = `${h.number} - ${h.title}`;
                        resultsBox.style.display = 'none';
                        // Trigger data binding
                        input.dispatchEvent(new Event('input'));
                    };
                    resultsBox.appendChild(div);
                });
            } else { resultsBox.style.display = 'none'; }
        }
    });

    // Close on click outside
    document.addEventListener('click', (e) => {
        if (!input.parentElement.contains(e.target)) resultsBox.style.display = 'none';
    });
}
