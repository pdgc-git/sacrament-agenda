/* js/simple-ui.js */
const state = { recognitions: [], announcements: [], releases: [], callings: [], speakers: [] };

document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    setupDataBinding();
});

function setupEventListeners() {
    // Dynamic List Buttons
    ['recognition', 'announcement', 'release', 'calling', 'speaker'].forEach(type => {
        document.getElementById(`btn-add-${type}`)?.addEventListener('click', () => {
            if (type === 'speaker') addSpeaker();
            else addListItem(type + 's'); // Pluralize
        });
    });

    document.getElementById('btn-export-pdf')?.addEventListener('click', exportPDF);
    document.getElementById('fullscreen-toggle')?.addEventListener('click', toggleFullScreen);

    // Fast Meeting Toggle
    document.getElementById('fastMeeting')?.addEventListener('change', (e) => {
        const isFast = e.target.checked;
        const els = {
            speakers: document.getElementById('speakers-list'),
            note: document.getElementById('fast-meeting-note'),
            hymn: document.getElementById('intermediate-hymn-wrapper')
        };
        if (els.speakers) els.speakers.style.display = isFast ? 'none' : 'block';
        if (els.hymn) els.hymn.style.display = isFast ? 'none' : 'block';
        if (els.note) els.note.style.display = isFast ? 'block' : 'none';
    });

    // Event Delegation for Dynamic Items
    document.getElementById('agendaForm')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-remove');
        if (btn) removeListItem(btn.dataset.type, btn.dataset.id);
    });

    document.getElementById('agendaForm')?.addEventListener('input', (e) => {
        if (e.target.classList.contains('dynamic-input')) {
            updateListItem(e.target.dataset.type, e.target.dataset.id, e.target.dataset.field, e.target.value);
        }
    });

    // Hymn Search
    document.querySelectorAll('.hymn-search').forEach(setupHymnSearch);
}

function setupDataBinding() {
    document.querySelectorAll('input[name], textarea[name]').forEach(input => {
        input.addEventListener('input', () => {
            const target = document.querySelector(`[data-bind="${input.name}"]`);
            if (target) {
                // Apply formatting only if it's the date field
                if (input.type === 'date') {
                    target.textContent = formatDate(input.value);
                } else {
                    target.textContent = input.value;
                }
            }
        });
    });
}

// Logic Helpers
function addListItem(type) {
    const id = crypto.randomUUID();
    state[type].push({ id, text: '', name: '', calling: '' });
    renderListInput(type);
    renderPreviewList(type);
}
function addSpeaker() {
    state.speakers.push({ id: crypto.randomUUID(), name: '' });
    renderSpeakers();
    renderPreviewSpeakers();
}
function removeListItem(type, id) {
    state[type] = state[type].filter(i => i.id !== id);
    if (type === 'speakers') { renderSpeakers(); renderPreviewSpeakers(); }
    else { renderListInput(type); renderPreviewList(type); }
}
function updateListItem(type, id, field, value) {
    const item = state[type].find(i => i.id === id);
    if (item) {
        if (field) item[field] = value;
        else item.text = value;
    }
    if (type === 'speakers') renderPreviewSpeakers();
    else renderPreviewList(type);
}

// Rendering Logic
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
            `;
        } else {
            div.innerHTML = `<input type="text" class="dynamic-input" placeholder="Texto" value="${item.text}" data-type="${type}" data-id="${item.id}" data-field="text" style="flex:1">`;
        }
        div.innerHTML += `<button class="btn-remove" data-type="${type}" data-id="${item.id}">×</button>`;
        container.appendChild(div);
    });
}
function renderSpeakers() {
    const c = document.getElementById('speakers-input-container');
    c.innerHTML = '';
    state.speakers.forEach((s, i) => {
        c.innerHTML += `
            <div class="input-row">
                <label style="font-size:0.8rem; width:20px;">${i + 1}.</label>
                <input type="text" class="dynamic-input" placeholder="Orador" value="${s.name}" data-type="speakers" data-id="${s.id}" data-field="name" style="flex:1">
                <button class="btn-remove" data-type="speakers" data-id="${s.id}">×</button>
            </div>`;
    });
}
function renderPreviewList(type) {
    const map = { recognitions: 'preview-recognitions', announcements: 'preview-announcements', releases: 'preview-releases', callings: 'preview-callings' };
    const el = document.getElementById(map[type]);
    if (!el) return;
    const ul = el.querySelector('ul');
    ul.innerHTML = '';

    if (state[type].length) {
        el.style.display = 'block';
        if (type === 'releases' || type === 'callings') document.getElementById('preview-business').style.display = 'block';
        state[type].forEach(i => {
            const li = document.createElement('li');
            li.textContent = (type === 'releases' || type === 'callings') ? `${i.name} (${i.calling})` : i.text;
            ul.appendChild(li);
        });
    } else {
        el.style.display = 'none';
    }
}
function renderPreviewSpeakers() {
    const l = document.getElementById('speakers-list');
    l.innerHTML = '';
    state.speakers.forEach(s => {
        l.innerHTML += `<div class="speaker-item"><span class="program-label">Orador</span><span class="program-value">${s.name}</span></div>`;
    });
}

// Utilities
function exportPDF() {
    const el = document.getElementById('agenda-paper');
    if (window.html2pdf) html2pdf().set({ margin: 0, filename: 'agenda.pdf', image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'in', format: 'a4' } }).from(el).save();
    else alert('Erro: Biblioteca PDF não carregada.');
}
function toggleFullScreen() { document.querySelector('.app-layout').classList.toggle('full-screen'); }
function setupHymnSearch(input) {
    const res = input.parentElement.querySelector('.hymn-results');
    input.addEventListener('input', () => {
        const val = input.value.toLowerCase();
        if (!val) { res.style.display = 'none'; return; }
        if (window.hymns) {
            const m = window.hymns.filter(h => h.number.toString().startsWith(val) || h.title.toLowerCase().includes(val)).slice(0, 5);
            res.innerHTML = '';
            if (m.length) {
                res.style.display = 'block';
                m.forEach(h => {
                    const d = document.createElement('div');
                    d.className = 'hymn-result-item';
                    d.textContent = `${h.number} - ${h.title}`;
                    d.onclick = () => { input.value = d.textContent; res.style.display = 'none'; input.dispatchEvent(new Event('input')); };
                    res.appendChild(d);
                });
            } else res.style.display = 'none';
        }
    });
    document.addEventListener('click', e => { if (!input.parentElement.contains(e.target)) res.style.display = 'none'; });
}

function formatDate(dateInput) {
    if (!dateInput) return '...';

    // Safety check: Ensure input is a string
    const s = String(dateInput);

    // Handle YYYY-MM-DD (Standard HTML Date Input)
    if (s.includes('-') && s.length === 10) {
        const [year, month, day] = s.split('-');
        return `${day}-${month}-${year}`;
    }

    return s; // Fallback
}
