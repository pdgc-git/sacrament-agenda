/* js/simple-ui.js */
const state = {
    recognitions: [],
    announcements: [],
    releases: [],
    callings: [],
    speakersBefore: [],
    speakersAfter: []
};
import { setupHymnSearch } from './utils/uiUtils.js';
import { showToast } from './components/Toast.js';
import { hymns } from './hymns.js';
import { escapeHtml } from './utils/security.js';

document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    setupDataBinding();
});

function setupEventListeners() {
    // Dynamic List Buttons
    ['recognition', 'announcement', 'release', 'calling'].forEach(type => {
        document.getElementById(`btn-add-${type}`)?.addEventListener('click', () => {
            addListItem(type + 's'); // Pluralize
        });
    });

    document.getElementById('btn-add-speaker-before')?.addEventListener('click', () => addSpeaker('before'));
    document.getElementById('btn-add-speaker-after')?.addEventListener('click', () => addSpeaker('after'));

    document.getElementById('btn-export-pdf')?.addEventListener('click', exportPDF);
    document.getElementById('fullscreen-toggle')?.addEventListener('click', toggleFullScreen);

    // Fast Meeting Toggle
    document.getElementById('fastMeeting')?.addEventListener('change', (e) => {
        const isFast = e.target.checked;
        const els = {
            speakersBefore: document.getElementById('speakers-before-list'),
            speakersAfter: document.getElementById('speakers-after-list'),
            note: document.getElementById('fast-meeting-note'),
            hymn: document.getElementById('intermediate-hymn-wrapper'),
            previewHymn: document.getElementById('preview-intermediate-hymn')
        };
        const display = isFast ? 'none' : 'block';
        if (els.speakersBefore) els.speakersBefore.style.display = display;
        if (els.speakersAfter) els.speakersAfter.style.display = display;
        if (els.hymn) els.hymn.style.display = display;
        if (els.previewHymn) els.previewHymn.style.display = display; // Use logic for hiding later
        if (els.note) els.note.style.display = isFast ? 'block' : 'none';

        // Force re-render of preview hymn visibility if unchecking fast meeting
        if (!isFast) {
            checkIntermediateHymnVisibility();
        }
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
    document.querySelectorAll('.hymn-search').forEach(input => {
        setupHymnSearch(input, hymns);
        // Add specific listener for intermediate hymn to toggle preview visibility
        if (input.name === 'intermediateHymn') {
            input.addEventListener('input', checkIntermediateHymnVisibility);
            input.addEventListener('hymn-selected', checkIntermediateHymnVisibility); // If custom event is used
            // Since setupHymnSearch might not dispatch 'input' on click, we ensure we catch changes
            // Assuming setupHymnSearch updates the input value.
            // We can use a MutationObserver or just polling, but direct events are better.
            // In the previous check, setupHymnSearch dispatches 'input' or 'hymn-selected'.
        }
    });
}

function checkIntermediateHymnVisibility() {
    const input = document.querySelector('input[name="intermediateHymn"]');
    const previewEl = document.getElementById('preview-intermediate-hymn');
    if (input && previewEl) {
        // Only show if content exists AND not fast meeting
        const isFast = document.getElementById('fastMeeting')?.checked;
        if (input.value.trim() !== '' && !isFast) {
            previewEl.style.display = 'flex'; // Use flex to match program-item
        } else {
            previewEl.style.display = 'none';
        }
    }
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
            // For intermediate hymn, also check visibility
            if (input.name === 'intermediateHymn') checkIntermediateHymnVisibility();
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

function addSpeaker(section) {
    const arrayName = section === 'before' ? 'speakersBefore' : 'speakersAfter';
    state[arrayName].push({ id: crypto.randomUUID(), name: '' });
    renderSpeakers(section);
    renderPreviewSpeakers(section);
}

function removeListItem(type, id) {
    // Check if it's a speaker
    if (type === 'speakersBefore') {
        state.speakersBefore = state.speakersBefore.filter(i => i.id !== id);
        renderSpeakers('before');
        renderPreviewSpeakers('before');
    } else if (type === 'speakersAfter') {
        state.speakersAfter = state.speakersAfter.filter(i => i.id !== id);
        renderSpeakers('after');
        renderPreviewSpeakers('after');
    } else {
        state[type] = state[type].filter(i => i.id !== id);
        renderListInput(type);
        renderPreviewList(type);
    }
}

function updateListItem(type, id, field, value) {
    let list = state[type]; // by reference
    const item = list.find(i => i.id === id);
    if (item) {
        if (field) item[field] = value;
        else item.text = value;
    }

    if (type === 'speakersBefore') renderPreviewSpeakers('before');
    else if (type === 'speakersAfter') renderPreviewSpeakers('after');
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
                <input type="text" class="dynamic-input" placeholder="Nome" value="${escapeHtml(item.name)}" data-type="${type}" data-id="${item.id}" data-field="name" style="flex:1">
                <input type="text" class="dynamic-input" placeholder="Chamado" value="${escapeHtml(item.calling)}" data-type="${type}" data-id="${item.id}" data-field="calling" style="flex:1">
            `;
        } else {
            div.innerHTML = `<input type="text" class="dynamic-input" placeholder="Texto" value="${escapeHtml(item.text)}" data-type="${type}" data-id="${item.id}" data-field="text" style="flex:1">`;
        }
        div.innerHTML += `<button class="btn-remove" data-type="${type}" data-id="${item.id}">×</button>`;
        container.appendChild(div);
    });
}

function renderSpeakers(section) {
    const type = section === 'before' ? 'speakersBefore' : 'speakersAfter';
    const containerId = section === 'before' ? 'speakers-before-input-container' : 'speakers-after-input-container';
    const container = document.getElementById(containerId);

    if (!container) return;
    container.innerHTML = '';

    state[type].forEach((s, i) => {
        container.innerHTML += `
            <div class="input-row">
                <input type="text" class="dynamic-input" placeholder="Orador" value="${escapeHtml(s.name)}" data-type="${type}" data-id="${s.id}" data-field="name" style="flex:1">
                <button class="btn-remove" data-type="${type}" data-id="${s.id}">×</button>
            </div>`;
    });
}

function renderPreviewSpeakers(section) {
    const type = section === 'before' ? 'speakersBefore' : 'speakersAfter';
    const containerId = section === 'before' ? 'speakers-before-list' : 'speakers-after-list';
    const l = document.getElementById(containerId);

    if (!l) return;
    l.innerHTML = '';

    state[type].forEach(s => {
        l.innerHTML += `<div class="speaker-item"><span class="program-label">Orador</span><span class="program-value">${escapeHtml(s.name)}</span></div>`;
    });
}

// Preview Rendering
function renderPreviewList(type) {
    const previewContainer = document.getElementById(`preview-${type}`);
    const listEl = previewContainer?.querySelector(`[data-bind="${type}"]`);
    if (!listEl) return;

    const items = state[type] || [];
    listEl.innerHTML = '';

    items.forEach(item => {
        const li = document.createElement('li');
        if (type === 'releases' || type === 'callings') {
            const name = item.name || '';
            const calling = item.calling || '';
            li.textContent = calling ? `${name} — ${calling}` : name;
        } else {
            li.textContent = item.text || '';
        }
        listEl.appendChild(li);
    });

    // Toggle section visibility
    if (previewContainer) {
        previewContainer.style.display = items.length > 0 ? 'block' : 'none';
    }

    // Toggle parent business section for releases/callings
    if (type === 'releases' || type === 'callings') {
        const businessSection = document.getElementById('preview-business');
        if (businessSection) {
            const hasReleases = (state.releases || []).length > 0;
            const hasCallings = (state.callings || []).length > 0;
            businessSection.style.display = (hasReleases || hasCallings) ? 'block' : 'none';
        }
    }
}

// Utilities
function exportPDF() {
    const el = document.getElementById('agenda-paper');
    if (window.html2pdf) {
        html2pdf()
            .set({
                margin: 0,
                filename: 'agenda.pdf',
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true },
                jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
            })
            .from(el)
            .save()
            .catch(err => {
                console.error('PDF Generation Error:', err);
                showToast('Erro ao gerar PDF: ' + err.message, 'error');
            });
    } else {
        showToast('Erro: Biblioteca PDF não carregada.', 'error');
    }
}

function toggleFullScreen() {
    document.querySelector('.app-layout').classList.toggle('full-screen');
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

