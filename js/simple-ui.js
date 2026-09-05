/* js/simple-ui.js — anonymous single-agenda editor (simple.html). No backend.
   The preview is rendered by the shared js/render-agenda.js, the same function the planner uses,
   so both tiers always print the same agenda. */
import { setupHymnSearch } from './utils/uiUtils.js';
import { showToast } from './components/Toast.js';
import { hymns } from './hymns.js';
import { escapeHtml } from './utils/security.js';
import { renderAgendaHtml } from './render-agenda.js';

const state = {
    recognitions: [],
    announcements: [],
    releases: [],
    callings: [],
    speakersBefore: [],
    speakersAfter: []
};

document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    renderPreview();
});

function setupEventListeners() {
    ['recognition', 'announcement', 'release', 'calling'].forEach(type => {
        document.getElementById(`btn-add-${type}`)?.addEventListener('click', () => addListItem(type + 's'));
    });
    document.getElementById('btn-add-speaker-before')?.addEventListener('click', () => addSpeaker('before'));
    document.getElementById('btn-add-speaker-after')?.addEventListener('click', () => addSpeaker('after'));
    document.getElementById('btn-export-pdf')?.addEventListener('click', exportPDF);
    document.getElementById('fullscreen-toggle')?.addEventListener('click', toggleFullScreen);

    document.getElementById('fastMeeting')?.addEventListener('change', (e) => {
        const isFast = e.target.checked;
        const program = document.getElementById('program-section');
        if (program) program.style.display = isFast ? 'none' : '';
        renderPreview();
    });

    const form = document.getElementById('agendaForm');
    form?.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-remove');
        if (btn) removeListItem(btn.dataset.type, btn.dataset.id);
    });
    form?.addEventListener('input', (e) => {
        if (e.target.classList.contains('dynamic-input')) {
            updateListItem(e.target.dataset.type, e.target.dataset.id, e.target.dataset.field, e.target.value);
        }
        renderPreview();
    });

    document.querySelectorAll('.hymn-search').forEach(input => {
        setupHymnSearch(input, hymns);
        input.addEventListener('hymn-selected', renderPreview);
    });
}

// ── State helpers ─────────────────────────────────────────────────────────────

function addListItem(type) {
    state[type].push({ id: crypto.randomUUID(), text: '', name: '', calling: '' });
    renderListInput(type);
    renderPreview();
}

function addSpeaker(section) {
    const key = section === 'before' ? 'speakersBefore' : 'speakersAfter';
    state[key].push({ id: crypto.randomUUID(), name: '' });
    renderSpeakers(section);
    renderPreview();
}

function removeListItem(type, id) {
    state[type] = state[type].filter(i => i.id !== id);
    if (type === 'speakersBefore') renderSpeakers('before');
    else if (type === 'speakersAfter') renderSpeakers('after');
    else renderListInput(type);
    renderPreview();
}

function updateListItem(type, id, field, value) {
    const item = state[type]?.find(i => i.id === id);
    if (item) item[field || 'text'] = value;
}

// ── Form rendering ────────────────────────────────────────────────────────────

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
                <input type="text" class="dynamic-input" placeholder="Chamado" value="${escapeHtml(item.calling)}" data-type="${type}" data-id="${item.id}" data-field="calling" style="flex:1">`;
        } else {
            div.innerHTML = `<input type="text" class="dynamic-input" placeholder="Texto" value="${escapeHtml(item.text)}" data-type="${type}" data-id="${item.id}" data-field="text" style="flex:1">`;
        }
        div.innerHTML += `<button class="btn-remove" data-type="${type}" data-id="${item.id}">×</button>`;
        container.appendChild(div);
    });
}

function renderSpeakers(section) {
    const type = section === 'before' ? 'speakersBefore' : 'speakersAfter';
    const container = document.getElementById(`speakers-${section}-input-container`);
    if (!container) return;
    container.innerHTML = state[type].map(s => `
        <div class="input-row">
            <input type="text" class="dynamic-input" placeholder="Orador" value="${escapeHtml(s.name)}" data-type="${type}" data-id="${s.id}" data-field="name" style="flex:1">
            <button class="btn-remove" data-type="${type}" data-id="${s.id}">×</button>
        </div>`).join('');
}

// ── Preview ───────────────────────────────────────────────────────────────────

// Adapt the form + list state to the meeting shape render-agenda.js expects.
export function toMeeting(form, st) {
    const el = name => form?.elements?.namedItem(name);
    const v = name => el(name)?.value?.trim() || '';
    return {
        date: v('date'),
        ward_name: v('ward') || 'Ala de [Nome]',
        presiding: v('presiding'), conducting: v('conducting'), organist: v('organist'), chorister: v('chorister'),
        opening_hymn: v('openingHymn'), sacrament_hymn: v('sacramentHymn'),
        intermediate_hymn: v('intermediateHymn'), closing_hymn: v('closingHymn'),
        invocation: v('invocation'), benediction: v('benediction'),
        kind: el('fastMeeting')?.checked ? 'fast' : 'normal',
        recognitions: st.recognitions, announcements: st.announcements,
        releases: st.releases, callings: st.callings,
        program: [
            ...st.speakersBefore.map(s => ({ type: 'speaker', id: s.id, name: s.name, position: 'before' })),
            ...st.speakersAfter.map(s => ({ type: 'speaker', id: s.id, name: s.name, position: 'after' })),
        ],
    };
}

function renderPreview() {
    const paper = document.getElementById('agenda-paper');
    if (!paper) return;
    const form = document.getElementById('agendaForm');
    paper.innerHTML = renderAgendaHtml(toMeeting(form, state));
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function exportPDF() {
    const element = document.getElementById('agenda-paper');
    const wardName = document.querySelector('input[name="ward"]')?.value || 'Agenda';
    const date = document.querySelector('input[name="date"]')?.value || 'data';
    const opt = {
        margin: 0,
        filename: `Agenda_${wardName.replace(/\s+/g, '_')}_${date}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    if (typeof html2pdf === 'undefined') { showToast('Biblioteca PDF não carregada.', 'error'); return; }
    html2pdf().set(opt).from(element).save()
        .then(() => showToast('PDF gerado.', 'success'))
        .catch(err => { console.error(err); showToast('Erro ao gerar PDF.', 'error'); });
}

function toggleFullScreen() {
    document.body.classList.toggle('fullscreen-mode');
}
window.toggleFullScreen = toggleFullScreen;
