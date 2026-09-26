// Púlpito: what the conductor reads from the stand. Dark, large type, exact meeting order.
// Tap an item to mark it current; tap a speaker for move / remove / substitute. "Terminar reunião"
// confirms who actually spoke/prayed + attendance and finalizes (this is what feeds history).
// Works offline once loaded: the meeting is cached in localStorage per date.
import * as DM from '../dataManager.js';
import { state, canEdit, reloadStats } from '../app-state.js';
import { escapeHtml } from '../utils/security.js';
import { showToast } from '../components/Toast.js';
import { agendaSequence } from '../render-agenda.js';
import { openMemberPicker } from '../components/picker.js';
import { nextSunday, toIsoDate, formatDateHeading, speakers, newSpeaker, hymnNumber, weekIndex, applyWardDefaults } from '../utils/meeting.js';

let m = null;
let root = null;
let currentIdx = -1;
let sheet = null;

export async function render(container, params) {
    root = container;
    const date = params[0] || toIsoDate(nextSunday(new Date()));
    const cacheKey = `agenda-pulpit-${date}`;
    try {
        const row = await DM.getPlanByDate(date);
        if (!row) throw new Error('Não há reunião planeada para ' + date + '.');
        m = normalize(row);
        try { localStorage.setItem(cacheKey, JSON.stringify(m)); } catch { /* ignore */ }
    } catch (e) {
        let cached = null;
        try { cached = JSON.parse(localStorage.getItem(cacheKey) || 'null'); } catch { /* ignore */ }
        if (!cached) throw e;
        m = cached;
        showToast('Sem ligação — a mostrar a última versão guardada neste dispositivo.', 'warning', 5000);
    }
    currentIdx = -1;
    draw();
}

export function destroy() { closeSheet(); document.body.classList.remove('pulpit-mode'); }

function normalize(row) {
    row.program = (row.program || []).map(it => it.type === 'speaker' ? { ...newSpeaker(), ...it } : it);
    return applyWardDefaults(row, state.settings, weekIndex(row.date));
}

function draw() {
    const seq = agendaSequence(m, { membersById: state.membersById });
    const done = m.status === 'completed';
    let itemIdx = -1;
    root.innerHTML = `
      <div class="pulpit" id="pulpit-root">
        <div class="p-head">
          <div><div class="d">${escapeHtml(formatDateHeading(m.date))}</div><div class="s">${escapeHtml(state.ward?.name || '')} · dirige ${escapeHtml(m.conducting || '—')}</div></div>
          <a class="exit" href="#domingo/${m.date}">Sair</a>
        </div>
        <div class="p-body">
          <div class="p-meta">
            <div>Preside<b>${escapeHtml(m.presiding || '—')}</b></div><div>Pianista<b>${escapeHtml(m.organist || '—')}</b></div>
            <div>Dirige<b>${escapeHtml(m.conducting || '—')}</b></div><div>Regente<b>${escapeHtml(m.chorister || '—')}</b></div>
          </div>
          ${seq.map(entry => {
            if (entry.kind === 'list') {
                return `<div class="p-sec">${escapeHtml(entry.label)}</div><ul class="p-list">${entry.items.map(it =>
                    typeof it === 'string' ? `<li>${escapeHtml(it)}</li>` : `<li><span class="sub">${escapeHtml(it.sub)}</span>${escapeHtml(it.text)}</li>`).join('')}</ul>`;
            }
            if (entry.kind === 'section') return `<div class="p-sec">${escapeHtml(entry.label)}</div>`;
            if (entry.kind === 'note') return `<div class="p-note">${escapeHtml(entry.label)}</div>`;
            itemIdx++;
            const idx = itemIdx;
            const cls = ['p-item', entry.kind === 'hymn' ? 'hymn' : '', idx < currentIdx ? 'done' : '', idx === currentIdx ? 'now' : ''].join(' ');
            const value = entry.value ? escapeHtml(entry.value) : '<span class="missing">— por atribuir</span>';
            return `<button type="button" class="${cls}" data-idx="${idx}" ${entry.role === 'speaker' ? `data-speaker="${entry.id}"` : ''}>
                <span class="l">${escapeHtml(entry.label)}</span>
                <span class="v ${entry.value ? '' : 'missing'}">${value}${entry.sub ? `<small>${escapeHtml(entry.sub)}</small>` : ''}</span></button>`;
          }).join('')}
          ${done ? '<p class="hint" style="margin-top:18px">Reunião terminada e registada.</p>' : ''}
        </div>
        <div class="p-foot">
          <a class="pb dim" href="#ausencias/${m.date}" style="text-align:center; text-decoration:none">Ausências</a>
          ${canEdit() && !done ? `<button type="button" class="pb gold" id="btn-finish">Terminar reunião</button>` : ''}
        </div>
      </div>`;

    const wrap = root.querySelector('#pulpit-root');
    wrap.addEventListener('click', onClick);
}

function onClick(ev) {
    if (ev.target.id === 'btn-finish') { openFinish(); return; }
    const item = ev.target.closest('.p-item');
    if (!item) return;
    const idx = Number(item.dataset.idx);
    if (item.dataset.speaker && canEdit() && m.status !== 'completed') {
        openSpeakerSheet(item.dataset.speaker);
        return;
    }
    currentIdx = currentIdx === idx ? idx + 1 : idx;
    draw();
}

// ── Speaker actions ──────────────────────────────────────────────────────────

function openSpeakerSheet(id) {
    closeSheet();
    const s = m.program.find(x => x.id === id);
    if (!s) return;
    sheet = document.createElement('div');
    sheet.className = 'p-sheet';
    sheet.innerHTML = `
        <div class="t">${escapeHtml(s.name || 'Orador')}${s.topic ? ` <span style="font-weight:400; color:var(--pulpit-soft)">· ${escapeHtml(s.topic)}</span>` : ''}</div>
        <div class="p-act"><button type="button" class="pb dim" data-a="move">${s.position === 'after' ? '↑ Passar para antes do hino' : '↓ Passar para depois do hino'}</button></div>
        <div class="p-act"><button type="button" class="pb dim" data-a="up">↑ Subir</button><button type="button" class="pb dim" data-a="down">↓ Descer</button></div>
        <div class="p-act"><button type="button" class="pb dim" data-a="remove">Não veio — tirar da agenda</button></div>
        <div class="p-act"><button type="button" class="pb gold" data-a="swap">Substituir por…</button></div>
        <div class="p-act"><button type="button" class="pb dim" data-a="close">Fechar</button></div>
        <p class="hint">Alterações ficam gravadas na reunião e contam para o histórico ao terminar.</p>`;
    document.body.appendChild(sheet);
    sheet.addEventListener('click', async ev => {
        const a = ev.target.closest('[data-a]')?.dataset.a;
        if (!a) return;
        const sp = speakers(m.program);
        const i = sp.indexOf(s);
        if (a === 'close') { closeSheet(); return; }
        if (a === 'move') s.position = s.position === 'after' ? 'before' : 'after';
        if (a === 'up' && i > 0) swapInProgram(s, sp[i - 1]);
        if (a === 'down' && i < sp.length - 1) swapInProgram(s, sp[i + 1]);
        if (a === 'remove') m.program.splice(m.program.indexOf(s), 1);
        if (a === 'swap') {
            openMemberPicker(sheet, {
                title: 'Substituir ' + s.name, verb: 'falou', members: state.members, lastDates: state.lastTalk,
                excludeIds: new Set(sp.map(x => x.member_id).filter(Boolean)),
                onPick: member => { Object.assign(s, { name: member.name, member_id: member.id, invite_status: 'confirmed' }); persist(); closeSheet(); draw(); },
            });
            return;
        }
        persist(); closeSheet(); draw();
    });
}

function swapInProgram(a, b) {
    const ia = m.program.indexOf(a), ib = m.program.indexOf(b);
    m.program[ia] = b; m.program[ib] = a;
}

function closeSheet() { if (sheet) { sheet.remove(); sheet = null; } }

async function persist() {
    try { await DM.saveFuturePlan(m); state.meetingsCache.set(m.date, m); }
    catch (e) { console.error(e); showToast('Não foi possível guardar: ' + e.message, 'error'); }
}

// ── Terminar reunião ─────────────────────────────────────────────────────────

function openFinish() {
    const sp = speakers(m.program).filter(s => s.name);
    const invocation = m.invocation || state.membersById.get(m.invocation_member_id)?.name;
    const benediction = m.benediction || state.membersById.get(m.benediction_member_id)?.name;
    const hymnList = [m.opening_hymn, m.sacrament_hymn, m.intermediate_hymn, m.closing_hymn].map(hymnNumber).filter(Boolean);
    const prevTotal = m.attendance?.total ?? '';

    root.innerHTML = `
      <div class="pulpit" id="pulpit-root">
        <div class="p-head"><div><div class="d">Terminar reunião</div><div class="s">${escapeHtml(formatDateHeading(m.date))}</div></div><button type="button" class="exit" id="btn-back">Voltar</button></div>
        <div class="p-body">
          <div class="p-sec">Presença</div>
          <label class="big-in"><span class="k">Total na capela</span><input type="number" inputmode="numeric" min="0" id="in-total" value="${escapeHtml(String(prevTotal))}" placeholder="0"></label>
          <div class="p-sec">Quem falou e orou</div>
          <p class="hint">Pré-marcado pelo programa. Desmarque quem não o fez — só o que fica marcado entra no histórico.</p>
          ${invocation ? confirmRow('invocation', `${invocation} · Primeira Oração`) : ''}
          ${sp.map(s => confirmRow(`spk:${s.id}`, `${s.name} · Discurso`)).join('')}
          ${benediction ? confirmRow('benediction', `${benediction} · Última Oração`) : ''}
          <div class="p-sec">Hinos cantados</div>
          ${confirmRow('hymns', hymnList.join(' · ') || '—')}
          <div class="p-sec">Ausências</div>
          <a class="confirm-row" href="#ausencias/${m.date}" style="text-decoration:none"><span>Marcadas da estande</span><span style="color:var(--pulpit-accent)">Rever ›</span></a>
        </div>
        <div class="p-foot"><button type="button" class="pb gold" id="btn-confirm">Terminar e guardar</button></div>
      </div>`;

    const wrap = root.querySelector('#pulpit-root');
    wrap.addEventListener('click', async ev => {
        if (ev.target.id === 'btn-back') { draw(); return; }
        const row = ev.target.closest('.confirm-row[data-k]');
        if (row) { row.querySelector('.chk').classList.toggle('on'); return; }
        if (ev.target.id === 'btn-confirm') await finish(wrap);
    });
}

function confirmRow(key, label) {
    return `<button type="button" class="confirm-row" data-k="${escapeHtml(key)}"><span>${escapeHtml(label)}</span><span class="chk on">✓</span></button>`;
}

async function finish(wrap) {
    const checked = new Set([...wrap.querySelectorAll('.confirm-row[data-k]')].filter(r => r.querySelector('.chk.on')).map(r => r.dataset.k));
    const program = m.program.filter(it => it.type !== 'speaker' || !it.name || checked.has(`spk:${it.id}`));
    const total = wrap.querySelector('#in-total').value;
    const confirmed = {
        date: m.date,
        program,
        invocation_member_id: checked.has('invocation') ? m.invocation_member_id : null,
        benediction_member_id: checked.has('benediction') ? m.benediction_member_id : null,
        attendance: total === '' ? (m.attendance ?? null) : { total: Number(total), recorded_at: new Date().toISOString() },
    };
    if (!checked.has('hymns')) {
        // Hymns weren't sung as planned: clear them so hymn_usage doesn't record them.
        await DM.saveFuturePlan({ ...m, opening_hymn: null, sacrament_hymn: null, intermediate_hymn: null, closing_hymn: null });
    } else {
        await DM.saveFuturePlan(m);
    }
    const btn = wrap.querySelector('#btn-confirm');
    btn.disabled = true;
    try {
        const result = await DM.finalizeMeeting(confirmed);
        m = normalize(result);
        state.meetingsCache.set(m.date, m);
        await reloadStats();
        showToast('Reunião terminada. Histórico atualizado.', 'success');
        draw();
    } catch (e) {
        console.error(e);
        showToast(e.message, 'error');
        btn.disabled = false;
    }
}
