// Membros: roster + per-member history, and the LCR PDF import (pdfParser.js, kept from v1).
import * as DM from '../dataManager.js';
import { state, canEdit, reloadMembers } from '../app-state.js';
import { escapeHtml } from '../utils/security.js';
import { showToast } from '../components/Toast.js';
import { extractVisualLines, parseMemberLines, normalizeName, parseCallingUpdates } from '../utils/pdfParser.js';
import { formatAgo, formatDateLong, formatDateShort, memberAvailability } from '../utils/meeting.js';
import { GROUP_LABELS } from '../components/picker.js';

let root = null;
let search = '';
let group = null;
let showMoved = false;
let modal = null;

export async function render(container) {
    root = container;
    draw();
}

export function destroy() { closeModal(); }

function draw() {
    const moved = state.members.filter(m => m.status === 'moved').length;
    const rows = state.members
        .filter(m => showMoved ? m.status === 'moved' : m.status !== 'moved')
        .filter(m => !group || m.group === group)
        .filter(m => !search || m.name.toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name));

    root.innerHTML = `<div id="mem-root">
        <div class="view-head">
            <div><h2>Membros</h2><div class="sub">${state.members.length - moved} no rol${moved ? `, ${moved} ${moved === 1 ? 'saiu' : 'saíram'} da ala` : ''}</div></div>
            <div class="actions">
                ${canEdit() ? `<button type="button" class="btn" id="btn-import">Importar do LCR</button><button type="button" class="btn primary" id="btn-add">+ Membro</button>` : ''}
            </div>
        </div>
        <div class="actions" style="margin-bottom:12px">
            <input class="input" id="mem-search" type="search" placeholder="Pesquisar nome…" value="${escapeHtml(search)}" style="max-width:260px">
            <div class="chips">
                <button type="button" class="chip ${!group ? 'on' : ''}" data-g="">Todos</button>
                ${Object.entries(GROUP_LABELS).map(([g, label]) => `<button type="button" class="chip ${group === g ? 'on' : ''}" data-g="${g}">${label}</button>`).join('')}
                ${moved ? `<button type="button" class="chip ${showMoved ? 'on' : ''}" id="chip-moved">Saíram da ala · ${moved}</button>` : ''}
            </div>
        </div>
        <div class="card tight scroll-x">
            <table class="table">
                <thead><tr><th>Nome</th><th>Chamado</th><th>Grupo</th><th>Falou</th><th>Orou</th><th></th></tr></thead>
                <tbody>
                ${rows.length === 0 ? '<tr><td colspan="6" class="empty-note">Ninguém.</td></tr>' : ''}
                ${rows.map(m => `<tr data-id="${m.id}">
                    <td><b>${escapeHtml(m.name)}</b> <span class="muted small">${m.gender || ''}</span>${statusTag(m)}</td>
                    <td class="small">${escapeHtml(m.calling || '—')}</td>
                    <td class="small">${escapeHtml(GROUP_LABELS[m.group] || m.group)}</td>
                    <td class="small">${formatAgo(state.lastTalk.get(m.id))}</td>
                    <td class="small">${formatAgo(state.lastPrayer.get(m.id))}</td>
                    <td class="actions" style="justify-content:flex-end">
                        <button type="button" class="btn tiny" data-act="view">Histórico</button>
                        ${canEdit() ? `<button type="button" class="btn tiny" data-act="edit">Editar</button>` : ''}
                    </td></tr>`).join('')}
                </tbody>
            </table>
        </div>
    </div>`;

    const wrap = root.querySelector('#mem-root');
    wrap.addEventListener('click', onClick);
    wrap.querySelector('#mem-search').addEventListener('input', ev => {
        search = ev.target.value;
        const pos = ev.target.selectionStart;
        draw();
        const inp = root.querySelector('#mem-search'); inp.focus(); inp.setSelectionRange(pos, pos);
    });
}

function statusTag(m) {
    const a = memberAvailability(m);
    if (a === 'moved') return ' <span class="pill">saiu da ala</span>';
    if (a === 'away') return ` <span class="pill" title="${escapeHtml(m.status_note || '')}">indisponível${m.away_until ? ' até ' + formatDateShort(m.away_until) : ''}</span>`;
    return '';
}

function onClick(ev) {
    if (ev.target.id === 'chip-moved') { showMoved = !showMoved; draw(); return; }
    const g = ev.target.closest('[data-g]');
    if (g) { group = g.dataset.g || null; draw(); return; }
    if (ev.target.id === 'btn-add') { openMemberModal(null); return; }
    if (ev.target.id === 'btn-import') { openImport(); return; }
    const act = ev.target.closest('[data-act]');
    if (!act) return;
    const id = act.closest('tr').dataset.id;
    const member = state.membersById.get(id);
    if (act.dataset.act === 'edit') openMemberModal(member);
    if (act.dataset.act === 'view') openHistory(member);
}

// ── Modals ───────────────────────────────────────────────────────────────────

function showModal(html, cls = '') {
    closeModal();
    modal = document.createElement('div');
    modal.className = 'modal-bg';
    modal.innerHTML = `<div class="modal ${cls}" role="dialog">${html}</div>`;
    modal.addEventListener('click', ev => { if (ev.target === modal || ev.target.closest('[data-close]')) closeModal(); });
    document.body.appendChild(modal);
    return modal.firstElementChild;
}
function closeModal() { if (modal) { modal.remove(); modal = null; } }

function openMemberModal(member) {
    const m = member || { name: '', gender: 'M', group: 'Adult', calling: '', status: 'active' };
    const st = m.status || 'active';
    const box = showModal(`
        <h3>${member ? 'Editar membro' : 'Novo membro'}</h3>
        <form id="mem-form">
            <div class="field"><label for="f-name">Nome</label><input class="input" id="f-name" name="name" value="${escapeHtml(m.name)}" required></div>
            <div class="field"><span class="lbl">Sexo</span><div class="radio-row">
                <label><input type="radio" name="gender" value="M" ${m.gender !== 'F' ? 'checked' : ''}> Homem</label>
                <label><input type="radio" name="gender" value="F" ${m.gender === 'F' ? 'checked' : ''}> Mulher</label></div></div>
            <div class="field"><label for="f-group">Grupo</label><select class="input" id="f-group" name="group">
                ${Object.entries(GROUP_LABELS).map(([g, label]) => `<option value="${g}" ${m.group === g ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
            <div class="field"><label for="f-calling">Chamado</label><input class="input" id="f-calling" name="calling" value="${escapeHtml(m.calling || '')}"></div>
            <div class="field"><label for="f-status">Situação</label><select class="input" id="f-status" name="status">
                <option value="active" ${st === 'active' ? 'selected' : ''}>Disponível</option>
                <option value="away" ${st === 'away' ? 'selected' : ''}>Indisponível para discursar / ausente</option>
                <option value="moved" ${st === 'moved' ? 'selected' : ''}>Já não está na ala</option></select></div>
            <div class="status-extra" ${st === 'away' ? '' : 'hidden'}>
                <div class="field"><label for="f-until">Até (opcional)</label><input class="input" type="date" id="f-until" name="away_until" value="${escapeHtml(m.away_until || '')}"></div>
            </div>
            <div class="field status-note" ${st === 'active' ? 'hidden' : ''}><label for="f-note">Nota (opcional)</label><input class="input" id="f-note" name="status_note" value="${escapeHtml(m.status_note || '')}" placeholder="ex.: doente, a estudar fora, mudou-se para o Porto"></div>
            <div class="foot">
                ${member ? '<button type="button" class="btn danger" id="btn-del">Apagar</button><button type="button" class="btn" id="btn-unreg">Não é da ala</button>' : ''}
                <button type="button" class="btn" data-close>Cancelar</button><button type="submit" class="btn primary">Guardar</button>
            </div>
        </form>`);
    const form = box.querySelector('#mem-form');
    form.status.addEventListener('change', () => {
        box.querySelector('.status-extra').hidden = form.status.value !== 'away';
        box.querySelector('.status-note').hidden = form.status.value === 'active';
    });
    form.addEventListener('submit', async ev => {
        ev.preventDefault();
        const status = form.status.value;
        try {
            await DM.saveMember({
                id: member?.id, name: form.name.value.trim(), gender: form.gender.value, group: form.group.value, calling: form.calling.value.trim() || null,
                status, status_note: status === 'active' ? null : (form.status_note.value.trim() || null),
                away_until: status === 'away' ? (form.away_until.value || null) : null,
            });
            await reloadMembers(); closeModal(); draw();
            showToast('Membro guardado.', 'success');
        } catch (e) { showToast(e.message, 'error'); }
    });
    box.querySelector('#btn-del')?.addEventListener('click', async () => {
        if (!confirm(`Apagar ${member.name} do rol?`)) return;
        try { await DM.deleteMember(member.id); await reloadMembers(); closeModal(); draw(); showToast('Membro apagado.', 'success'); }
        catch (e) { showToast(e.message, 'error'); }
    });
    box.querySelector('#btn-unreg')?.addEventListener('click', onUnregister(member));
}

function onUnregister(member) {
    return async () => {
        if (!confirm(`Tirar ${member.name} do rol? Os discursos e orações passados ficam registados só com o nome, como visitante.`)) return;
        try { await DM.unregisterMember(member.id); await reloadMembers(); closeModal(); draw(); showToast(`${member.name} saiu do rol.`, 'success'); }
        catch (e) { showToast(e.message, 'error'); }
    };
}

async function openHistory(member) {
    const box = showModal(`<h3>${escapeHtml(member.name)}</h3><div class="loading">A carregar…</div>`);
    const h = await DM.getMemberHistory(member.id);
    box.innerHTML = `
        <h3>${escapeHtml(member.name)}</h3>
        <p class="small muted">${escapeHtml(GROUP_LABELS[member.group] || member.group)}${member.calling ? ' · ' + escapeHtml(member.calling) : ''}</p>
        <div class="two-col" style="margin-top:12px">
            <div><span class="lbl">Discursos</span>${h.talks.length ? h.talks.map(t => `<div class="row-kv"><span class="v" style="font-weight:400">${escapeHtml(formatDateLong(isoOf(t.date)))}<span class="topic"> · ${escapeHtml(t.topic)}</span></span></div>`).join('') : '<div class="empty-note">Nunca falou.</div>'}</div>
            <div><span class="lbl">Orações</span>${h.prayers.length ? h.prayers.map(p => `<div class="row-kv"><span class="v" style="font-weight:400">${escapeHtml(formatDateLong(isoOf(p.date)))}<span class="topic"> · ${escapeHtml(p.type)}</span></span></div>`).join('') : '<div class="empty-note">Nunca orou.</div>'}</div>
        </div>
        <div class="foot"><button type="button" class="btn" data-close>Fechar</button></div>`;
}

function isoOf(d) { return d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10); }

// ── LCR import ───────────────────────────────────────────────────────────────

function openImport() {
    const box = showModal(`
        <h3>Importar do LCR</h3>
        <p class="small muted">Passo 1 — escolha o PDF da lista de membros (obrigatório) e, opcionalmente, o PDF de chamados. Passo 2 — reveja a tabela antes de confirmar. Membros já existentes (mesmo nome) são atualizados, não duplicados.</p>
        <div class="field"><label for="file-members">Lista de membros (PDF)</label><input class="input" type="file" id="file-members" accept="application/pdf"></div>
        <div class="field"><label for="file-callings">Chamados (PDF, opcional)</label><input class="input" type="file" id="file-callings" accept="application/pdf"></div>
        <div class="foot"><button type="button" class="btn" data-close>Cancelar</button><button type="button" class="btn primary" id="btn-process">Analisar</button></div>`, 'wide');

    box.querySelector('#btn-process').addEventListener('click', async () => {
        const fileMembers = box.querySelector('#file-members').files[0];
        const fileCallings = box.querySelector('#file-callings').files[0];
        if (!fileMembers) { showToast('Escolha o PDF da lista de membros.', 'warning'); return; }
        const btn = box.querySelector('#btn-process');
        btn.disabled = true; btn.textContent = 'A analisar…';
        try {
            const membersData = parseMemberLines(await extractVisualLines(fileMembers));
            if (membersData.length === 0) throw new Error('Não foi possível encontrar membros. O PDF pode estar num formato desconhecido.');
            const map = new Map(membersData.map(m => [normalizeName(m.name), m]));
            if (fileCallings) parseCallingUpdates(await extractVisualLines(fileCallings), Array.from(map.values()));
            renderPreview(box, Array.from(map.values()));
        } catch (e) {
            console.error(e); showToast('Erro ao processar PDF: ' + e.message, 'error');
            btn.disabled = false; btn.textContent = 'Analisar';
        }
    });
}

function renderPreview(box, data) {
    data.sort((a, b) => (b.calling ? 1 : 0) - (a.calling ? 1 : 0) || a.name.localeCompare(b.name));
    const existing = new Map(state.members.map(m => [normalizeName(m.name), m]));
    box.innerHTML = `
        <h3>Importar do LCR — passo 2</h3>
        <p class="small muted">${data.length} linhas detetadas · ${data.filter(m => existing.has(normalizeName(m.name))).length} já existem (serão atualizadas). Edite ou remova antes de confirmar.</p>
        <div class="actions" style="margin-bottom:8px"><button type="button" class="btn tiny" id="btn-rm-nocalling">Remover sem chamado</button></div>
        <div class="scroll-x" style="max-height:50vh; overflow-y:auto">
        <table class="table" id="import-table"><thead><tr><th>Nome</th><th>Idade</th><th>Sexo</th><th>Grupo</th><th>Chamado</th><th></th></tr></thead><tbody>
        ${data.map(m => `<tr>
            <td><input class="input p-name" style="padding:4px 8px" value="${escapeHtml(m.name)}"></td>
            <td class="small tabular">${escapeHtml(String(m.age ?? ''))}</td>
            <td><select class="input p-gender" style="padding:4px 6px; width:auto"><option value="M" ${m.gender !== 'F' ? 'selected' : ''}>M</option><option value="F" ${m.gender === 'F' ? 'selected' : ''}>F</option></select></td>
            <td><select class="input p-group" style="padding:4px 6px; width:auto">${Object.entries(GROUP_LABELS).map(([g, label]) => `<option value="${g}" ${m.group === g ? 'selected' : ''}>${label}</option>`).join('')}</select></td>
            <td><input class="input p-calling" style="padding:4px 8px" value="${escapeHtml(m.calling || '')}" placeholder="—"></td>
            <td><button type="button" class="x" data-rm aria-label="Remover">✕</button></td></tr>`).join('')}
        </tbody></table></div>
        <div class="foot"><button type="button" class="btn" data-close>Cancelar</button><button type="button" class="btn primary" id="btn-confirm">Importar</button></div>`;

    box.addEventListener('click', ev => {
        if (ev.target.closest('[data-rm]')) ev.target.closest('tr').remove();
        if (ev.target.id === 'btn-rm-nocalling') {
            let n = 0;
            box.querySelectorAll('tbody tr').forEach(tr => { if (!tr.querySelector('.p-calling').value.trim()) { tr.remove(); n++; } });
            showToast(`${n} sem chamado removidos.`, 'success');
        }
    });
    box.querySelector('#btn-confirm').addEventListener('click', async () => {
        const rows = [...box.querySelectorAll('tbody tr')];
        const btn = box.querySelector('#btn-confirm');
        btn.disabled = true;
        let ok = 0, fail = 0;
        for (const tr of rows) {
            const name = tr.querySelector('.p-name').value.trim();
            if (!name) continue;
            const prev = existing.get(normalizeName(name));
            try {
                await DM.saveMember({ id: prev?.id, name, gender: tr.querySelector('.p-gender').value, group: tr.querySelector('.p-group').value, calling: tr.querySelector('.p-calling').value.trim() || null });
                ok++;
            } catch (e) { console.error(e); fail++; }
        }
        await reloadMembers(); closeModal(); draw();
        showToast(`${ok} membros importados${fail ? `, ${fail} falharam` : ''}.`, fail ? 'warning' : 'success');
    });
}
