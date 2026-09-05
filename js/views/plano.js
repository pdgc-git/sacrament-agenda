// Plano: the monthly grid. Rows = Sundays, columns = kind·dirige, speakers (3, 4th on demand),
// prayers, hymns. Every cell opens the ranked/filtered picker. Saves per row (debounced).
import * as DM from '../dataManager.js';
import { state, canEdit, canEditHymns, cacheMeetings } from '../app-state.js';
import { escapeHtml } from '../utils/security.js';
import { showToast } from '../components/Toast.js';
import { pickSpeaker, pickPrayer, pickHymn, addSpeaker, setInviteStatus, hymnRepeats } from '../components/assign.js';
import {
    MEETING_KINDS, KINDS_WITHOUT_PROGRAM, INVITE_STATUS, sundaysInMonth, formatDateShort, formatMonth,
    blankMeeting, missingItems, speakers, newSpeaker, balance, formatBalance, hymnNumber, weekIndex, shiftMonth,
} from '../utils/meeting.js';

let month = ''; // 'YYYY-MM'
let meetings = new Map(); // date -> meeting (drafts + completed in range)
let dates = [];
let root = null;
const saveTimers = new Map();

export async function render(container, params) {
    root = container;
    const today = new Date();
    month = /^\d{4}-\d{2}$/.test(params[0] || '') ? params[0] : `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    dates = sundaysInMonth(month);
    const rows = await DM.getMeetingsInRange(dates[0], dates[dates.length - 1]);
    cacheMeetings(rows);
    meetings = new Map();
    dates.forEach(d => {
        const existing = rows.find(r => r.date === d);
        meetings.set(d, existing ? normalize(existing) : { ...blankMeeting(d, state.settings, weekIndex(d)), _new: true });
    });
    draw();
}

export function destroy() {
    saveTimers.forEach(t => clearTimeout(t));
    saveTimers.clear();
}

function normalize(m) {
    m.program = (m.program || []).map(it => it.type === 'speaker' ? { ...newSpeaker(), ...it } : it);
    return m;
}

// ── Drawing ──────────────────────────────────────────────────────────────────

function draw() {
    const monthBalance = monthBalances();
    const mb = monthBalance.get(month) || { men: 0, women: 0, youth: 0 };
    const today = new Date();
    const thisMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const options = [];
    for (let k = -6; k <= 12; k++) options.push(shiftMonth(thisMonth, k));
    if (!options.includes(month)) options.push(month);
    options.sort();
    const missingTotal = dates.reduce((n, d) => n + missingItems(meetings.get(d)).length, 0);
    root.innerHTML = `
        <div class="view-head">
            <div>
                <div class="month-nav">
                    <a class="btn month-arrow" href="#plano/${shiftMonth(month, -1)}" aria-label="Mês anterior">‹</a>
                    <h2>${escapeHtml(formatMonth(dates[0]))}</h2>
                    <a class="btn month-arrow" href="#plano/${shiftMonth(month, 1)}" aria-label="Mês seguinte">›</a>
                    <select class="input month-select" id="month-select" aria-label="Ir para mês">
                        ${options.map(o => `<option value="${o}" ${o === month ? 'selected' : ''}>${escapeHtml(formatMonth(o + '-01'))}${o === thisMonth ? ' · este mês' : ''}</option>`).join('')}
                    </select>
                    ${month !== thisMonth ? `<a class="btn tiny" href="#plano/${thisMonth}">este mês</a>` : ''}
                </div>
                <div class="sub">${dates.length} domingos · ${missingTotal === 0 ? 'tudo atribuído' : `falta${missingTotal === 1 ? '' : 'm'} ${missingTotal}`} · oradores do mês: ${escapeHtml(formatBalance(mb))}</div>
            </div>
            <div class="actions">
                <div class="legend">
                    <span><i class="st confirmed"></i>confirmado</span><span><i class="st asked"></i>convidado</span>
                    <span><i class="st declined"></i>recusou</span><span><i class="st to_ask"></i>por convidar</span>
                </div>
            </div>
        </div>
        <div class="card tight scroll-x">
            <table class="table plan-grid">
                <thead><tr>
                    <th>Domingo</th><th>Tipo · Dirige</th><th>Orador 1</th><th>Orador 2</th><th>Orador 3</th><th>Orador 4</th>
                    <th>1.ª Oração</th><th>Última Oração</th><th>Hinos</th>
                </tr></thead>
                <tbody>${dates.map(d => rowHtml(meetings.get(d), monthBalance)).join('')}</tbody>
            </table>
        </div>
        <p class="small muted" style="margin-top:10px">O estado da linha é o que falta ("Falta 2"), não "rascunho". Clique num nome para trocar, no ponto para mudar o estado do convite, no tema para o escrever. Filtros por homens/mulheres e jovens no seletor.</p>`;

    root.querySelector('tbody').addEventListener('click', onGridClick);
    root.querySelector('tbody').addEventListener('change', onGridChange);
    root.querySelector('tbody').addEventListener('input', onGridInput);
    root.querySelector('#month-select').addEventListener('change', ev => { location.hash = '#plano/' + ev.target.value; });
}

function rowHtml(m, monthBalance) {
    const d = m.date;
    const done = m.status === 'completed';
    const missing = missingItems(m);
    const statusPill = done ? '<span class="pill ok">Feita</span>'
        : KINDS_WITHOUT_PROGRAM.has(m.kind) ? '<span class="pill">—</span>'
            : missing.length === 0 ? '<span class="pill ok">Pronta</span>'
                : `<span class="pill" title="${escapeHtml(missing.join(', '))}">Falta ${missing.length}</span>`;
    const bal = balance(speakers(m.program), state.membersById);
    const mb = monthBalance.get(d.slice(0, 7));
    const balHtml = KINDS_WITHOUT_PROGRAM.has(m.kind) || m.kind === 'fast' ? '' :
        `<span class="bal" title="Mês: ${escapeHtml(formatBalance(mb))}">${bal.men}H · ${bal.women}M · <span class="${bal.youth === 0 ? 'low' : ''}">${bal.youth} ${bal.youth === 1 ? 'jovem' : 'jovens'}</span></span>`;

    const kindCell = `
        <select class="kind-select" data-d="${d}" data-f="kind" ${!canEdit() || done ? 'disabled' : ''}>
            ${Object.entries(MEETING_KINDS).map(([k, label]) => `<option value="${k}" ${m.kind === k ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
        <div style="margin-top:4px">${textCell(m, 'conducting', 'dirige?')}</div>`;

    if (KINDS_WITHOUT_PROGRAM.has(m.kind)) {
        return `<tr class="row-noprog" data-d="${d}">
            <td class="date-cell"><b>${formatDateShort(d)}</b>${statusPill}</td>
            <td>${kindCell}</td>
            <td colspan="7">${escapeHtml(MEETING_KINDS[m.kind])} — sem reunião sacramental na ala</td></tr>`;
    }

    const sp = speakers(m.program);
    const speakerCells = [0, 1, 2, 3].map(i => {
        if (m.kind === 'fast') return i === 0 ? '' : null;
        const s = sp[i];
        if (s) return `<td>${speakerCell(m, s, i)}</td>`;
        if (i === 3 && !done && canEdit()) return `<td><button type="button" class="cell-empty" data-d="${d}" data-act="add4">+ 4.º</button></td>`;
        if (i === 3) return '<td><span class="muted">—</span></td>';
        return `<td>${done ? '<span class="muted">—</span>' : `<button type="button" class="cell-empty" data-d="${d}" data-act="addspk" data-i="${i}">+ atribuir</button>`}</td>`;
    });
    const speakersHtml = m.kind === 'fast'
        ? `<td colspan="4" class="muted small">Testemunhos da congregação — sem oradores</td>`
        : speakerCells.join('');

    return `<tr data-d="${d}" class="${done ? 'done' : ''}">
        <td class="date-cell"><b>${formatDateShort(d)}</b>${statusPill}${balHtml}</td>
        <td>${kindCell}</td>
        ${speakersHtml}
        <td>${prayerCell(m, 'invocation')}</td>
        <td>${prayerCell(m, 'benediction')}</td>
        <td>${hymnsCell(m)}</td>
    </tr>`;
}

function textCell(m, field, placeholder) {
    if (!canEdit() || m.status === 'completed') return `<span class="small">${escapeHtml(m[field] || '—')}</span>`;
    return `<input class="topic-input" style="font-style:normal" data-d="${m.date}" data-f="${field}" value="${escapeHtml(m[field] || '')}" placeholder="${placeholder}">`;
}

function speakerCell(m, s, i) {
    const editable = canEdit() && m.status !== 'completed';
    const st = s.invite_status || 'to_ask';
    if (!s.name) {
        return editable
            ? `<button type="button" class="cell-empty" data-d="${m.date}" data-act="pick-spk" data-i="${i}">+ atribuir</button>`
            : '<span class="muted">—</span>';
    }
    return `<div class="assign">
        <button type="button" class="assign" data-d="${m.date}" data-act="pick-spk" data-i="${i}" ${editable ? '' : 'disabled'}>
            <span class="n"><i class="st ${st}" title="${INVITE_STATUS[st]}"></i>${escapeHtml(s.name)}</span>
        </button>
        ${editable
            ? `<input class="topic-input" data-d="${m.date}" data-f="topic" data-i="${i}" value="${escapeHtml(s.topic || '')}" placeholder="tema">
               <div class="status-menu"><span class="muted small">${INVITE_STATUS[st]}</span>${Object.entries(INVITE_STATUS).map(([k, label]) =>
                `<button type="button" class="${st === k ? 'on' : ''}" data-d="${m.date}" data-act="status" data-i="${i}" data-v="${k}" title="${label}" aria-label="${label}"><i class="st ${k}"></i></button>`).join('')}</div>`
            : (s.topic ? `<span class="topic">${escapeHtml(s.topic)}</span>` : '')}
    </div>`;
}

function prayerCell(m, key) {
    const editable = canEdit() && m.status !== 'completed';
    const name = m[key] || state.membersById.get(m[`${key}_member_id`])?.name || '';
    if (!name) return editable ? `<button type="button" class="cell-empty" data-d="${m.date}" data-act="pick-prayer" data-k="${key}">+ atribuir</button>` : '<span class="muted">—</span>';
    return `<button type="button" class="assign" data-d="${m.date}" data-act="pick-prayer" data-k="${key}" ${editable ? '' : 'disabled'}><span class="n">${escapeHtml(name)}</span></button>`;
}

function hymnsCell(m) {
    const editable = canEditHymns() && m.status !== 'completed';
    const slots = [['opening_hymn', 'Abertura'], ['sacrament_hymn', 'Sacramental'], ['intermediate_hymn', 'Intermediário'], ['closing_hymn', 'Encerramento']];
    return `<div class="hymn-grid">${slots.map(([k, label]) => {
        const v = m[k];
        const n = hymnNumber(v);
        const recent = hymnRepeats(v);
        const inner = v
            ? `<span class="hymn-plain ${recent ? 'warn' : ''}" title="${escapeHtml(label + ': ' + v)}"><span class="muted small">${label.slice(0, 3)}</span> <span class="no">${escapeHtml(n || '')}</span>${recent ? ' ↺' : ''}</span>`
            : `<span class="muted small">${label}${k === 'intermediate_hymn' ? ' (opc.)' : ''}</span>`;
        return editable
            ? `<button type="button" class="assign" data-d="${m.date}" data-act="pick-hymn" data-k="${k}" title="${label}">${inner}</button>`
            : inner;
    }).join('')}</div>`;
}


function monthBalances() {
    const map = new Map();
    dates.forEach(d => {
        const key = d.slice(0, 7);
        const m = meetings.get(d);
        const b = balance(speakers(m.program), state.membersById);
        const acc = map.get(key) || { men: 0, women: 0, youth: 0, youngAdults: 0, unknown: 0 };
        Object.keys(acc).forEach(k => acc[k] += b[k]);
        map.set(key, acc);
    });
    return map;
}

// ── Interaction ──────────────────────────────────────────────────────────────

function onGridClick(ev) {
    const btn = ev.target.closest('[data-act]');
    if (!btn) return;
    const m = meetings.get(btn.dataset.d);
    const act = btn.dataset.act;
    const i = Number(btn.dataset.i);
    const changed = () => { redrawRow(m); save(m); };
    const mb = () => monthBalances().get(month);

    if (act === 'addspk' || act === 'add4') {
        const target = act === 'add4' ? 3 : i;
        while (speakers(m.program).length <= target) addSpeaker(m);
        changed();
        pickSpeaker(m, target, rowCell(m.date, target), changed, mb());
    } else if (act === 'pick-spk') {
        pickSpeaker(m, i, btn, changed, mb());
    } else if (act === 'status') {
        setInviteStatus(m, i, btn.dataset.v);
        changed();
    } else if (act === 'pick-prayer') {
        pickPrayer(m, btn.dataset.k, btn, changed);
    } else if (act === 'pick-hymn') {
        pickHymn(m, btn.dataset.k, btn, changed);
    }
}

function onGridChange(ev) {
    const el = ev.target;
    if (el.dataset.f === 'kind') {
        const m = meetings.get(el.dataset.d);
        m.kind = el.value;
        redrawRow(m); save(m);
    }
}

function onGridInput(ev) {
    const el = ev.target;
    if (!el.classList.contains('topic-input')) return;
    const m = meetings.get(el.dataset.d);
    if (el.dataset.f === 'topic') speakers(m.program)[Number(el.dataset.i)].topic = el.value;
    else m[el.dataset.f] = el.value;
    save(m, 900);
}

function rowCell(date, i) {
    return root.querySelector(`tr[data-d="${date}"] [data-act="pick-spk"][data-i="${i}"]`) || root.querySelector(`tr[data-d="${date}"]`);
}

function redrawRow(m) {
    const tr = root.querySelector(`tr[data-d="${m.date}"]`);
    if (!tr) return;
    const tmp = document.createElement('tbody');
    tmp.innerHTML = rowHtml(m, monthBalances());
    tr.replaceWith(tmp.firstElementChild);
    const sub = root.querySelector('.view-head .sub');
    if (sub) {
        const missingTotal = dates.reduce((n, d) => n + missingItems(meetings.get(d)).length, 0);
        sub.textContent = `${dates.length} domingos · ${missingTotal === 0 ? 'tudo atribuído' : `falta${missingTotal === 1 ? '' : 'm'} ${missingTotal}`} · oradores do mês: ${formatBalance(monthBalances().get(month))}`;
    }
}

function save(m, delay = 250) {
    if (!canEditHymns()) return;
    clearTimeout(saveTimers.get(m.date));
    saveTimers.set(m.date, setTimeout(async () => {
        try {
            await DM.saveFuturePlan(m);
            delete m._new;
            state.meetingsCache.set(m.date, m);
        } catch (e) {
            console.error(e);
            showToast('Não foi possível guardar ' + formatDateShort(m.date) + ': ' + e.message, 'error');
        }
    }, delay));
}
