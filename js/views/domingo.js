// Domingo: the next meeting (or #domingo/YYYY-MM-DD), prefilled from Plano + ward settings.
// Editable here: presidência/música overrides, reconhecimentos, anúncios, assuntos da ala.
// Right pane: the real A4 agenda (render-agenda.js). Actions: PDF, Partilhar, Modo púlpito.
import * as DM from '../dataManager.js';
import { state, canEdit } from '../app-state.js';
import { escapeHtml } from '../utils/security.js';
import { showToast } from '../components/Toast.js';
import { renderAgendaHtml } from '../render-agenda.js';
import {
    nextSunday, toIsoDate, formatDateHeading, formatDateShort, blankMeeting, missingItems, speakers,
    newSpeaker, INVITE_STATUS, KINDS_WITHOUT_PROGRAM, MEETING_KINDS, parseIsoDate, weekIndex,
} from '../utils/meeting.js';

let m = null;
let root = null;
let saveTimer = null;

export async function render(container, params) {
    root = container;
    const date = params[0] || toIsoDate(nextSunday(new Date()));
    const row = await DM.getPlanByDate(date);
    m = row ? normalize(row) : blankMeeting(date, state.settings, weekIndex(date));
    draw();
}

export function destroy() { clearTimeout(saveTimer); }

function normalize(row) {
    row.program = (row.program || []).map(it => it.type === 'speaker' ? { ...newSpeaker(), ...it } : it);
    ['recognitions', 'announcements', 'releases', 'callings'].forEach(k => { row[k] = row[k] || []; });
    return row;
}

function draw() {
    const d = m.date;
    const prev = toIsoDate(shiftDays(parseIsoDate(d), -7));
    const next = toIsoDate(shiftDays(parseIsoDate(d), 7));
    const missing = missingItems(m);
    const done = m.status === 'completed';
    const editable = canEdit() && !done;

    root.innerHTML = `<div id="domingo-root">
        <div class="view-head">
            <div>
                <h2>${escapeHtml(formatDateHeading(d))}</h2>
                <div class="sub">${done ? 'Reunião terminada' : (missing.length ? `Falta ${missing.length}: ${escapeHtml(missing.join(', '))}` : 'Tudo atribuído')}
                    &nbsp;·&nbsp; <a href="#domingo/${prev}">‹ ${formatDateShort(prev)}</a> &nbsp; <a href="#domingo/${next}">${formatDateShort(next)} ›</a></div>
            </div>
            <div class="actions">
                <button type="button" class="btn" id="btn-pdf">PDF</button>
                <button type="button" class="btn" id="btn-share">Partilhar</button>
                <a class="btn primary" href="#pulpito/${d}">Modo púlpito</a>
            </div>
        </div>
        <div class="domingo">
            <div>
                ${KINDS_WITHOUT_PROGRAM.has(m.kind) ? `<div class="alert info">${escapeHtml(MEETING_KINDS[m.kind])} — sem reunião sacramental na ala. <a href="#plano/${d}">Mudar no Plano</a></div>` : ''}
                <div class="card" style="margin-bottom:16px">
                    <div class="group">
                        <div class="g-head"><b>Presidência e música</b><span>das definições da ala</span></div>
                        ${kv('Preside', 'presiding', editable)}
                        ${kv('Dirige', 'conducting', editable)}
                        ${kv('Pianista / Organista', 'organist', editable)}
                        ${kv('Regente', 'chorister', editable)}
                    </div>
                    <div class="group">
                        <div class="g-head"><b>Do plano</b><span><a href="#plano/${d}">editar no Plano</a></span></div>
                        ${planRows()}
                    </div>
                </div>
                <div class="card">
                    ${listGroup('recognitions', 'Reconhecimentos', 'Adicionar reconhecimento', editable)}
                    ${listGroup('announcements', 'Anúncios', 'Adicionar anúncio', editable)}
                    <div class="group">
                        <div class="g-head"><b>Assuntos da Ala</b><span>da reunião de bispado</span></div>
                        ${pairList('releases', 'Desobrigações', 'Desobrigação', editable)}
                        ${pairList('callings', 'Chamados (Apoios)', 'Chamado', editable)}
                    </div>
                </div>
                ${done ? '' : `<p class="small muted" style="margin-top:10px">Guarda automaticamente. A reunião marca-se como feita no Modo púlpito, em "Terminar reunião".</p>`}
            </div>
            <div class="preview-pane"><div id="agenda-paper" class="agenda-paper">${renderAgendaHtml(m, { wardName: state.ward?.name, membersById: state.membersById })}</div></div>
        </div></div>`;

    const wrap = root.querySelector('#domingo-root');
    wrap.addEventListener('input', onInput);
    wrap.addEventListener('click', onClick);
}

function shiftDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }

function kv(label, field, editable) {
    return `<div class="row-kv"><span class="k">${label}</span>
        ${editable ? `<input class="input" style="padding:6px 10px; font-weight:600" data-f="${field}" value="${escapeHtml(m[field] || '')}" placeholder="—">`
            : `<span class="v ${m[field] ? '' : 'empty'}">${escapeHtml(m[field] || '—')}</span>`}</div>`;
}

function planRows() {
    if (KINDS_WITHOUT_PROGRAM.has(m.kind)) return '<div class="empty-note">Sem programa.</div>';
    const hymn = (label, v) => `<div class="row-kv"><span class="k">${label}</span><span class="v ${v ? '' : 'empty'}">${escapeHtml(v || 'por escolher')}</span></div>`;
    const prayer = (label, key) => {
        const name = m[key] || state.membersById.get(m[`${key}_member_id`])?.name || '';
        return `<div class="row-kv"><span class="k">${label}</span><span class="v ${name ? '' : 'warn'}">${escapeHtml(name || 'por atribuir')}</span></div>`;
    };
    let html = hymn('Hino de Abertura', m.opening_hymn) + prayer('Primeira Oração', 'invocation') + hymn('Hino Sacramental', m.sacrament_hymn);
    if (m.kind === 'fast') {
        html += `<div class="row-kv"><span class="k">Programa</span><span class="v">Testemunhos da Congregação</span></div>`;
    } else {
        speakers(m.program).forEach((s, i) => {
            const st = s.invite_status || 'to_ask';
            html += `<div class="row-kv"><span class="k">${i === 0 ? 'Oradores' : ''}</span>
                <span class="v ${s.name ? '' : 'warn'}"><i class="st ${st}" title="${INVITE_STATUS[st]}"></i>${escapeHtml(s.name || `${i + 1}.º por atribuir`)}
                ${s.topic ? `<span class="topic"> · ${escapeHtml(s.topic)}</span>` : ''}${s.name && st !== 'confirmed' ? `<span class="topic"> · ${INVITE_STATUS[st]}</span>` : ''}</span></div>`;
        });
        if (m.intermediate_hymn) html += hymn('Hino Intermediário', m.intermediate_hymn);
    }
    html += hymn('Hino de Encerramento', m.closing_hymn) + prayer('Última Oração', 'benediction');
    return html;
}

function listGroup(key, title, addLabel, editable) {
    const items = m[key];
    return `<div class="group" data-list="${key}">
        <div class="g-head"><b>${title}</b></div>
        ${items.length === 0 && !editable ? '<div class="empty-note">Nenhum.</div>' : ''}
        ${items.map((it, i) => editable
            ? `<div class="input-row"><input class="input" data-list="${key}" data-i="${i}" data-f="text" value="${escapeHtml(it.text || '')}" placeholder="…"><button type="button" class="x" data-rm="${key}" data-i="${i}" aria-label="Remover">✕</button></div>`
            : `<div class="row-kv"><span class="v" style="font-weight:400">${escapeHtml(it.text || '')}</span></div>`).join('')}
        ${editable ? `<button type="button" class="btn tiny" data-add="${key}">+ ${addLabel}</button>` : ''}
    </div>`;
}

function pairList(key, title, addLabel, editable) {
    const items = m[key];
    return `<div style="margin-bottom:12px" data-list="${key}">
        <span class="lbl">${title}</span>
        ${items.length === 0 && !editable ? '<div class="empty-note">Nenhum.</div>' : ''}
        ${items.map((it, i) => editable
            ? `<div class="input-row">
                <input class="input" data-list="${key}" data-i="${i}" data-f="name" value="${escapeHtml(it.name || '')}" placeholder="Nome">
                <input class="input" data-list="${key}" data-i="${i}" data-f="calling" value="${escapeHtml(it.calling || '')}" placeholder="Chamado">
                <button type="button" class="x" data-rm="${key}" data-i="${i}" aria-label="Remover">✕</button></div>`
            : `<div class="row-kv"><span class="v" style="font-weight:400">${escapeHtml(it.name || '')}${it.calling ? ' — ' + escapeHtml(it.calling) : ''}</span></div>`).join('')}
        ${editable ? `<button type="button" class="btn tiny" data-add="${key}">+ ${addLabel}</button>` : ''}
    </div>`;
}

// ── Events ───────────────────────────────────────────────────────────────────

function onInput(ev) {
    const el = ev.target;
    if (el.dataset.list) {
        m[el.dataset.list][Number(el.dataset.i)][el.dataset.f] = el.value;
    } else if (el.dataset.f) {
        m[el.dataset.f] = el.value;
    } else return;
    refreshPreview();
    save();
}

function onClick(ev) {
    const add = ev.target.closest('[data-add]');
    if (add) {
        const key = add.dataset.add;
        m[key].push(key === 'releases' || key === 'callings' ? { name: '', calling: '' } : { text: '' });
        redrawLists(); save();
        const inputs = root.querySelectorAll(`[data-list="${key}"] input`);
        inputs[inputs.length - (key === 'releases' || key === 'callings' ? 2 : 1)]?.focus();
        return;
    }
    const rm = ev.target.closest('[data-rm]');
    if (rm) {
        m[rm.dataset.rm].splice(Number(rm.dataset.i), 1);
        redrawLists(); refreshPreview(); save();
        return;
    }
    if (ev.target.id === 'btn-pdf') exportPdf(false);
    if (ev.target.id === 'btn-share') exportPdf(true);
}

function redrawLists() {
    // Cheapest correct approach: redraw the whole view (the form is small); keep scroll position.
    const y = window.scrollY;
    draw();
    window.scrollTo(0, y);
}

function refreshPreview() {
    const paper = root.querySelector('#agenda-paper');
    if (paper) paper.innerHTML = renderAgendaHtml(m, { wardName: state.ward?.name, membersById: state.membersById });
}

function save() {
    if (!canEdit() || m.status === 'completed') return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
        try { await DM.saveFuturePlan(m); state.meetingsCache.set(m.date, m); }
        catch (e) { console.error(e); showToast('Não foi possível guardar: ' + e.message, 'error'); }
    }, 600);
}

// ── PDF / share ──────────────────────────────────────────────────────────────

export async function exportPdf(share) {
    if (typeof html2pdf === 'undefined') { showToast('Biblioteca PDF não carregada.', 'error'); return; }
    // Render a clean A4 copy off-screen so the preview's scaling doesn't affect the output.
    const holder = document.createElement('div');
    holder.style.cssText = 'position:fixed; left:-10000px; top:0; width:210mm; background:#fff';
    holder.innerHTML = `<div class="agenda-paper" style="width:210mm; min-height:297mm">${renderAgendaHtml(m, { wardName: state.ward?.name, membersById: state.membersById })}</div>`;
    document.body.appendChild(holder);
    const filename = `Agenda_${m.date}.pdf`;
    const opt = { margin: 0, filename, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } };
    try {
        const worker = html2pdf().set(opt).from(holder.firstElementChild);
        if (share && navigator.share) {
            const blob = await worker.output('blob');
            const file = new File([blob], filename, { type: 'application/pdf' });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({ files: [file], title: 'Agenda Sacramental' });
                return;
            }
        }
        await worker.save();
    } catch (e) {
        if (e?.name !== 'AbortError') { console.error(e); showToast('Erro ao gerar PDF: ' + e.message, 'error'); }
    } finally {
        holder.remove();
    }
}
