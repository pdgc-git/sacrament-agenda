// Domingo: the next meeting (or #domingo/YYYY-MM-DD), prefilled from Plano + ward settings.
// Editable here: presidência/música overrides, reconhecimentos, anúncios, assuntos da ala.
// Right pane: the real A4 agenda (render-agenda.js). Actions: PDF, Partilhar, Modo púlpito.
import * as DM from '../dataManager.js';
import { state, canEdit, canEditMeeting, isLocked, unlockMeeting, reloadStats } from '../app-state.js';
import { escapeHtml } from '../utils/security.js';
import { showToast } from '../components/Toast.js';
import { renderAgendaHtml } from '../render-agenda.js';
import { pickSpeaker, pickPrayer, pickHymn, addSpeaker, removeSpeaker, setInviteStatus, hymnRepeats, HYMN_LABELS } from '../components/assign.js';
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
    const editable = canEditMeeting(m);

    if (KINDS_WITHOUT_PROGRAM.has(m.kind)) { drawNoMeeting(prev, next, editable); return; }

    root.innerHTML = `<div id="domingo-root">
        <div class="view-head">
            <div>
                <h2>${escapeHtml(formatDateHeading(d))}</h2>
                <div class="sub">${done ? (isLocked(m) ? 'Reunião terminada' : 'Reunião terminada, a editar. As alterações guardam-se sozinhas.') : (missing.length ? `Falta ${missing.length}: ${escapeHtml(missing.join(', '))}` : 'Tudo atribuído')}
                    &nbsp;·&nbsp; <a href="#domingo/${prev}">‹ ${formatDateShort(prev)}</a> &nbsp; <a href="#domingo/${next}">${formatDateShort(next)} ›</a></div>
            </div>
            <div class="actions">
                ${isLocked(m) && canEdit() ? '<button type="button" class="btn" id="btn-unlock">Editar reunião</button>' : ''}
                <button type="button" class="btn" id="btn-pdf">PDF</button>
                <button type="button" class="btn" id="btn-share">Partilhar</button>
                <a class="btn primary" href="#pulpito/${d}">Modo púlpito</a>
            </div>
        </div>
        <div class="domingo">
            <div>
                <div class="card">
                    <div class="group">
                        <div class="g-head"><b>Presidência e música</b><span>das definições da ala</span></div>
                        ${kv('Preside', 'presiding', editable)}
                        ${kv('Dirige', 'conducting', editable)}
                        ${kv('Pianista / Organista', 'organist', editable)}
                        ${kv('Regente', 'chorister', editable)}
                    </div>
                    ${listGroup('recognitions', 'Reconhecimentos', 'Adicionar reconhecimento', editable)}
                    ${listGroup('announcements', 'Anúncios', 'Adicionar anúncio', editable)}
                    <div class="group">
                        <div class="g-head"><b>Abertura</b><span>${editable ? `<select class="kind-select" data-f="kind">${Object.entries(MEETING_KINDS).map(([k, label]) => `<option value="${k}" ${m.kind === k ? 'selected' : ''}>${label}</option>`).join('')}</select>` : escapeHtml(MEETING_KINDS[m.kind])} · <a href="#plano/${d.slice(0, 7)}">ver o mês</a></span></div>
                        ${KINDS_WITHOUT_PROGRAM.has(m.kind) ? '<div class="empty-note">Sem programa.</div>' : hymnRow('opening_hymn', editable) + prayerRow('Primeira Oração', 'invocation', editable)}
                    </div>
                    <div class="group">
                        <div class="g-head"><b>Assuntos da Ala</b></div>
                        ${pairList('releases', 'Desobrigações', 'Desobrigação', editable)}
                        ${pairList('callings', 'Chamados (Apoios)', 'Chamado', editable)}
                    </div>
                    ${KINDS_WITHOUT_PROGRAM.has(m.kind) ? '' : `
                    <div class="group">
                        <div class="g-head"><b>Sacramento</b></div>
                        ${hymnRow('sacrament_hymn', editable)}
                    </div>
                    <div class="group">
                        <div class="g-head"><b>Programa</b></div>
                        ${programRows(editable)}
                    </div>
                    <div class="group">
                        <div class="g-head"><b>Encerramento</b></div>
                        ${hymnRow('closing_hymn', editable)}
                        ${prayerRow('Última Oração', 'benediction', editable)}
                    </div>`}
                </div>
                ${done ? '' : `<p class="small muted" style="margin-top:10px">Guarda automaticamente. Tudo o que está aqui também se edita no Plano, mês a mês. A reunião marca-se como feita no Modo púlpito, em "Terminar reunião".</p>`}
            </div>
            <div class="preview-pane"><div id="agenda-paper" class="agenda-paper">${renderAgendaHtml(m, { wardName: state.ward?.name, membersById: state.membersById })}</div></div>
        </div></div>`;

    wire();
}

// Conferência Geral / de Estaca: nothing to plan, so the whole page says so (like the column in Plano).
// The kind stays changeable in case the Sunday was set by mistake.
function drawNoMeeting(prev, next, editable) {
    const d = m.date;
    root.innerHTML = `<div id="domingo-root">
        <div class="view-head">
            <div>
                <h2>${escapeHtml(formatDateHeading(d))}</h2>
                <div class="sub"><a href="#domingo/${prev}">‹ ${formatDateShort(prev)}</a> &nbsp; <a href="#domingo/${next}">${formatDateShort(next)} ›</a></div>
            </div>
        </div>
        <div class="no-meeting">
            <p class="kind">${escapeHtml(MEETING_KINDS[m.kind])}</p>
            <p>Sem reunião sacramental na ala neste domingo.</p>
            ${editable ? `<label class="lbl" for="nm-kind">Tipo de domingo</label>
                <select class="input kind-select" id="nm-kind" data-f="kind">${Object.entries(MEETING_KINDS).map(([k, label]) => `<option value="${k}" ${m.kind === k ? 'selected' : ''}>${label}</option>`).join('')}</select>` : ''}
            <a class="link-btn" href="#plano/${d.slice(0, 7)}">Ver o mês no Plano</a>
        </div>
    </div>`;
    wire();
}

function wire() {
    const wrap = root.querySelector('#domingo-root');
    wrap.addEventListener('input', onInput);
    wrap.addEventListener('change', ev => { if (ev.target.dataset.f === 'kind') { m.kind = ev.target.value; redrawLists(); refreshPreview(); save(); } });
    wrap.addEventListener('click', onClick);
}

function shiftDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }

function kv(label, field, editable) {
    return `<div class="row-kv"><span class="k">${label}</span>
        ${editable ? `<input class="input" style="padding:6px 10px; font-weight:600" data-f="${field}" value="${escapeHtml(m[field] || '')}" placeholder="—">`
            : `<span class="v ${m[field] ? '' : 'empty'}">${escapeHtml(m[field] || '—')}</span>`}</div>`;
}

function pickBtn(editable, act, extra, cls, inner) {
    return editable
        ? `<button type="button" class="assign ${cls}" data-act="${act}" ${extra}><span class="n">${inner}</span></button>`
        : `<span class="v ${cls}">${inner}</span>`;
}

function hymnRow(key, editable) {
    const v = m[key];
    const recent = hymnRepeats(v, m.date);
    const inner = v ? `<span class="hymn-plain ${recent ? 'warn' : ''}">${escapeHtml(v)}${recent ? ' · cantado há pouco ↺' : ''}</span>` : `<span class="muted">por escolher</span>`;
    return `<div class="row-kv"><span class="k">${HYMN_LABELS[key]}${key === 'intermediate_hymn' ? ' <span class="muted">(opc.)</span>' : ''}</span>${pickBtn(editable, 'pick-hymn', `data-k="${key}"`, v ? '' : 'empty', inner)}</div>`;
}

function prayerRow(label, key, editable) {
    const name = m[key] || state.membersById.get(m[`${key}_member_id`])?.name || '';
    return `<div class="row-kv"><span class="k">${label}</span>${pickBtn(editable, 'pick-prayer', `data-k="${key}"`, name ? '' : 'warn', name ? escapeHtml(name) : 'por atribuir')}</div>`;
}

// Speakers in meeting order: before the intermediate hymn, the hymn, after.
function programRows(editable) {
    if (m.kind === 'fast') return `<div class="row-kv"><span class="k">Programa</span><span class="v">Testemunhos da Congregação</span></div>`;
    const sp = speakers(m.program);
    const shown = [...sp.filter(s => (s.position || 'before') === 'before'), ...sp.filter(s => s.position === 'after')];
    const row = (s) => {
        const i = sp.indexOf(s);
        const st = s.invite_status || 'to_ask';
        return `<div class="row-kv speaker-row" data-i="${i}"><span class="k">Orador ${shown.indexOf(s) + 1}</span>
            <span class="v" style="display:flex; flex-direction:column; gap:3px">
                <span class="spk-line">
                    ${pickBtn(editable, 'pick-spk', `data-i="${i}"`, s.name ? '' : 'warn', `<i class="st ${st}" title="${INVITE_STATUS[st]}"></i>${escapeHtml(s.name || 'por atribuir')}`)}
                    ${editable ? `<button type="button" class="x" data-act="rm-spk" data-i="${i}" title="Remover orador" aria-label="Remover orador">✕</button>` : ''}
                </span>
                ${editable && s.name ? `<input class="topic-input" data-f="topic" data-i="${i}" value="${escapeHtml(s.topic || '')}" placeholder="tema">
                    <div class="status-menu"><span class="muted small">${INVITE_STATUS[st]}</span>${Object.entries(INVITE_STATUS).map(([k, label]) =>
                        `<button type="button" class="${st === k ? 'on' : ''}" data-act="status" data-i="${i}" data-v="${k}" title="${label}" aria-label="${label}"><i class="st ${k}"></i></button>`).join('')}
                        <button type="button" class="link-btn" data-act="move" data-i="${i}">${s.position === 'after' ? '↑ antes do hino' : '↓ depois do hino'}</button></div>`
                    : (s.topic ? `<span class="topic">${escapeHtml(s.topic)}</span>` : '')}
            </span></div>`;
    };
    let html = sp.filter(s => (s.position || 'before') === 'before').map(row).join('');
    html += hymnRow('intermediate_hymn', editable);
    html += sp.filter(s => s.position === 'after').map(row).join('');
    if (editable) html += `<div class="row-kv"><span class="k"></span><button type="button" class="btn tiny" data-act="add-spk">+ Orador</button></div>`;
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
    } else if (el.dataset.f === 'topic') {
        speakers(m.program)[Number(el.dataset.i)].topic = el.value;
    } else if (el.dataset.f === 'kind') {
        return;
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
    if (ev.target.id === 'btn-unlock') { unlockMeeting(m.date); draw(); return; }
    if (ev.target.id === 'btn-pdf') { exportPdf(false); return; }
    if (ev.target.id === 'btn-share') { exportPdf(true); return; }

    const act = ev.target.closest('[data-act]');
    if (!act) return;
    const i = Number(act.dataset.i);
    const changed = () => { redrawLists(); refreshPreview(); save(); };
    switch (act.dataset.act) {
        case 'pick-spk': pickSpeaker(m, i, act, changed); break;
        case 'add-spk': { const idx = addSpeaker(m); changed(); const btn = root.querySelector(`[data-act="pick-spk"][data-i="${idx}"]`); if (btn) pickSpeaker(m, idx, btn, changed); break; }
        case 'rm-spk': removeSpeaker(m, i); changed(); break;
        case 'move': { const sp = speakers(m.program)[i]; sp.position = sp.position === 'after' ? 'before' : 'after'; changed(); break; }
        case 'status': setInviteStatus(m, i, act.dataset.v); changed(); break;
        case 'pick-prayer': pickPrayer(m, act.dataset.k, act, changed); break;
        case 'pick-hymn': pickHymn(m, act.dataset.k, act, changed); break;
    }
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
    if (!canEditMeeting(m)) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
        try {
            await DM.saveFuturePlan(m); state.meetingsCache.set(m.date, m);
            if (m.status === 'completed') await reloadStats(); // past talks feed the rotation stats
        }
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
