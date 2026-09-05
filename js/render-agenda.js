// The one place the agenda paper is rendered. Used by simple.html, the Domingo preview, the PDF
// export and the Púlpito view (via a different template, same data). Markup and class names are
// exactly those of the shipped simple.html / style.css `.agenda-paper`, in this fixed order:
//   header + meta-grid → Reconhecimentos → Anúncios → Hino de Abertura → Primeira Oração →
//   Assuntos da Ala (Desobrigações, Chamados) → Hino Sacramental → Administração do Sacramento →
//   Programa (oradores antes · Hino Intermediário · oradores depois | Testemunhos da Congregação) →
//   Hino de Encerramento → Última Oração.
// Empty sections are omitted.
import { escapeHtml } from './utils/security.js';
import { formatDateLong, speakersBefore, speakersAfter } from './utils/meeting.js';

const e = escapeHtml;

function listItemText(item) {
    if (typeof item === 'string') return item;
    if (item.calling) return `${item.name || ''} — ${item.calling}`;
    return item.text || item.name || '';
}

function nonEmpty(list = []) {
    return list.map(listItemText).filter(t => t && t.trim());
}

function cleanList(items) {
    return `<ul class="clean-list">${items.map(t => `<li>${e(t)}</li>`).join('')}</ul>`;
}

function programItem(label, value, extraClass = '') {
    const cls = extraClass ? ` ${extraClass}` : '';
    return `<div class="program-item${cls}"><span class="program-label">${label}</span>` +
        `<span class="program-value${extraClass === 'highlight-box' ? ' hymn' : ''}">${e(value || '…')}</span></div>`;
}

function hymnItem(label, value, boxed = false) {
    return `<div class="program-item${boxed ? ' highlight-box' : ''}"><span class="program-label">${label}</span>` +
        `<span class="program-value hymn">${e(value || '…')}</span></div>`;
}

function speakerRows(list) {
    return list.filter(s => s.name).map(s =>
        `<div class="speaker-item"><span class="program-label">Orador</span><span class="program-value">${e(s.name)}</span></div>`
    ).join('');
}

// Prayer display: prefer the free-text name, else the member name resolved by the caller.
function prayerName(m, key, membersById) {
    if (m[key]) return m[key];
    const id = m[`${key}_member_id`];
    if (id && membersById) return membersById.get(id)?.name || '';
    return '';
}

/**
 * @param {object} m   meeting row (dataManager shape; simple.html adapts its state to it)
 * @param {object} opts { wardName, membersById }
 * @returns {string} inner HTML for a `.agenda-paper` element
 */
export function renderAgendaHtml(m, opts = {}) {
    const wardName = opts.wardName || m.ward_name || '';
    const membersById = opts.membersById;
    const isFast = m.kind === 'fast' || m.is_fast_sunday;

    const recognitions = nonEmpty(m.recognitions);
    const announcements = nonEmpty(m.announcements);
    const releases = nonEmpty(m.releases);
    const callings = nonEmpty(m.callings);
    const before = speakersBefore(m.program);
    const after = speakersAfter(m.program);

    let html = `
<div class="agenda-header">
    <div class="header-line"></div>
    <h1>Agenda da Reunião Sacramental</h1>
    <h2>${e(wardName)}</h2>
    <p class="agenda-date">${e(formatDateLong(m.date))}</p>
</div>
<div class="agenda-body">
    <div class="meta-grid">
        <div class="meta-item"><span class="meta-label">Preside:</span><span class="meta-value">${e(m.presiding || '…')}</span></div>
        <div class="meta-item"><span class="meta-label">Dirige:</span><span class="meta-value">${e(m.conducting || '…')}</span></div>
        <div class="meta-item"><span class="meta-label">Pianista:</span><span class="meta-value">${e(m.organist || '…')}</span></div>
        <div class="meta-item"><span class="meta-label">Regente:</span><span class="meta-value">${e(m.chorister || '…')}</span></div>
    </div>
    <hr class="divider">`;

    if (recognitions.length) {
        html += `<div class="program-section"><h3>Reconhecimentos</h3>${cleanList(recognitions)}</div>`;
    }
    if (announcements.length) {
        html += `<div class="program-section"><h3>Anúncios</h3>${cleanList(announcements)}</div>`;
    }

    html += hymnItem('Hino de Abertura', m.opening_hymn);
    html += programItem('Primeira Oração', prayerName(m, 'invocation', membersById));

    if (releases.length || callings.length) {
        html += `<div class="program-section business-section"><h3>Assuntos da Ala</h3>`;
        if (releases.length) html += `<div class="business-block"><h4>Desobrigações</h4>${cleanList(releases)}</div>`;
        if (callings.length) html += `<div class="business-block"><h4>Chamados</h4>${cleanList(callings)}</div>`;
        html += `</div>`;
    }

    html += hymnItem('Hino Sacramental', m.sacrament_hymn, true);
    html += `<div class="sacrament-note"><p>Administração do Sacramento</p></div>`;

    html += `<div class="program-section speakers-section"><h3>Programa</h3>`;
    if (isFast) {
        html += `<div class="fast-meeting-note">Testemunhos da Congregação</div>`;
    } else {
        html += `<div class="speakers-list">${speakerRows(before)}</div>`;
        if (m.intermediate_hymn && (before.length || after.length)) {
            html += `<div class="program-item intermediate-hymn"><span class="program-label">Hino Intermediário</span>` +
                `<span class="program-value hymn">${e(m.intermediate_hymn)}</span></div>`;
        }
        html += `<div class="speakers-list">${speakerRows(after)}</div>`;
    }
    html += `</div>
    <hr class="divider">`;

    html += hymnItem('Hino de Encerramento', m.closing_hymn);
    html += programItem('Última Oração', prayerName(m, 'benediction', membersById));
    html += `\n</div>`;
    return html;
}

// Ordered, flat list of what happens in the meeting — the Púlpito view and tests use this rather
// than parsing HTML. Each entry: {kind:'section'|'item'|'hymn'|'note'|'list', label, value, id?}
export function agendaSequence(m, opts = {}) {
    const membersById = opts.membersById;
    const isFast = m.kind === 'fast' || m.is_fast_sunday;
    const seq = [];
    const recognitions = nonEmpty(m.recognitions);
    const announcements = nonEmpty(m.announcements);
    const releases = nonEmpty(m.releases);
    const callings = nonEmpty(m.callings);

    if (recognitions.length) seq.push({ kind: 'list', label: 'Reconhecimentos', items: recognitions });
    if (announcements.length) seq.push({ kind: 'list', label: 'Anúncios', items: announcements });
    seq.push({ kind: 'hymn', label: 'Hino de Abertura', value: m.opening_hymn || '' });
    seq.push({ kind: 'item', label: 'Primeira Oração', value: prayerName(m, 'invocation', membersById), role: 'invocation' });
    if (releases.length || callings.length) {
        const items = [];
        releases.forEach(t => items.push({ sub: 'Desobrigação', text: t }));
        callings.forEach(t => items.push({ sub: 'Chamado', text: t }));
        seq.push({ kind: 'list', label: 'Assuntos da Ala', items });
    }
    seq.push({ kind: 'hymn', label: 'Hino Sacramental', value: m.sacrament_hymn || '', boxed: true });
    seq.push({ kind: 'note', label: 'Administração do Sacramento' });
    seq.push({ kind: 'section', label: 'Programa' });
    if (isFast) {
        seq.push({ kind: 'note', label: 'Testemunhos da Congregação' });
    } else {
        const before = speakersBefore(m.program);
        const after = speakersAfter(m.program);
        before.forEach(s => seq.push({ kind: 'item', label: 'Orador', value: s.name, sub: s.topic, id: s.id, role: 'speaker' }));
        if (m.intermediate_hymn && (before.length || after.length)) {
            seq.push({ kind: 'hymn', label: 'Hino Intermediário', value: m.intermediate_hymn });
        }
        after.forEach(s => seq.push({ kind: 'item', label: 'Orador', value: s.name, sub: s.topic, id: s.id, role: 'speaker' }));
    }
    seq.push({ kind: 'hymn', label: 'Hino de Encerramento', value: m.closing_hymn || '' });
    seq.push({ kind: 'item', label: 'Última Oração', value: prayerName(m, 'benediction', membersById), role: 'benediction' });
    return seq;
}
