// Plano: the month as one column per Sunday (kind + dirige, then Abertura, Sacramento, Oradores
// added or removed per Sunday, Encerramento). Every slot opens the ranked/filtered picker. Saves per Sunday (debounced).
import * as DM from '../dataManager.js';
import { state, canEdit, canEditMeeting, canEditMeetingHymns, isLocked, isMusicOnly, unlockMeeting, cacheMeetings, reloadStats } from '../app-state.js';
import { escapeHtml } from '../utils/security.js';
import { showToast } from '../components/Toast.js';
import { pickSpeaker, pickPrayer, pickHymn, addSpeaker, removeSpeaker, setInviteStatus, hymnRepeats } from '../components/assign.js';
import {
    MEETING_KINDS, KINDS_WITHOUT_PROGRAM, INVITE_STATUS, sundaysInMonth, formatDateShort, formatMonth,
    blankMeeting, missingItems, speakers, newSpeaker, balance, hymnNumber, hymnTitle, weekIndex, shiftMonth, applyWardDefaults,
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
    return applyWardDefaults(m, state.settings, weekIndex(m.date));
}

// ── Drawing ──────────────────────────────────────────────────────────────────
// One column per Sunday, read top to bottom in meeting order. The band on top carries the month,
// its navigation and a public-domain painting that follows the theme (see planner.css .plan-hero).

const CUP = `<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M4 2.5 H12 L11 8 a3 3 0 0 1 -6 0 Z"/><path d="M8 11 V14 M5.5 14 H10.5"/></svg>`;

function draw() {
    const today = new Date();
    const thisMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const options = [];
    for (let k = -24; k <= 12; k++) options.push(shiftMonth(thisMonth, k));
    if (!options.includes(month)) options.push(month);
    options.sort();
    const [monthName, year] = formatMonth(dates[0]).split(' ');
    root.innerHTML = `
        <section class="plan-hero">
            <div class="hero-art" aria-hidden="true"></div>
            <p class="kick">Reuniões sacramentais</p>
            <h2 class="plan-title"><b>${escapeHtml(monthName)}</b> ${escapeHtml(year)}</h2>
            <div class="month-nav">
                <a class="btn month-arrow" href="#plano/${shiftMonth(month, -1)}" aria-label="Mês anterior">‹</a>
                <select class="input month-select" id="month-select" aria-label="Ir para mês">
                    ${options.map(o => `<option value="${o}" ${o === month ? 'selected' : ''}>${escapeHtml(capitalize(formatMonth(o + '-01')))}${o === thisMonth ? ', este mês' : ''}</option>`).join('')}
                </select>
                <a class="btn month-arrow" href="#plano/${shiftMonth(month, 1)}" aria-label="Mês seguinte">›</a>
                ${month !== thisMonth ? `<a class="btn" href="#plano/${thisMonth}">Este mês</a>` : ''}
                <span class="todo" id="plan-todo">${todoHtml()}</span>
            </div>
            <p class="hero-credit"><span class="l">Carl Bloch, Sermão da Montanha</span><span class="d">Heinrich Hofmann, Getsémani</span></p>
        </section>
        <div class="plan-meta">
            <div class="legend">
                <span><i class="st confirmed"></i>confirmado</span><span><i class="st asked"></i>convidado</span>
                <span><i class="st declined"></i>recusou</span><span><i class="st to_ask"></i>por convidar</span>
            </div>
            <span id="plan-balance">${balanceHtml()}</span>
        </div>
        <div class="weeks">${dates.map(d => weekHtml(meetings.get(d))).join('')}</div>`;

    const weeks = root.querySelector('.weeks');
    weeks.addEventListener('click', onGridClick);
    weeks.addEventListener('change', onGridChange);
    weeks.addEventListener('input', onGridInput);
    root.querySelector('#month-select').addEventListener('change', ev => { location.hash = '#plano/' + ev.target.value; });
}

const capitalize = str => str.charAt(0).toUpperCase() + str.slice(1);

function todoHtml() {
    const n = dates.reduce((acc, d) => acc + missingItems(meetings.get(d)).length, 0);
    return n === 0 ? 'Tudo atribuído este mês' : `<b>${n}</b> por fechar este mês`;
}

function balanceHtml() {
    const b = monthBalances().get(month) || { men: 0, women: 0, youth: 0 };
    return `Oradores do mês: ${b.men} ${b.men === 1 ? 'homem' : 'homens'}, ${b.women} ${b.women === 1 ? 'mulher' : 'mulheres'}, ` +
        `<span class="${b.youth === 0 ? 'low' : ''}">${b.youth} ${b.youth === 1 ? 'jovem' : 'jovens'}</span>`;
}

function weekHtml(m) {
    const d = m.date;
    const done = m.status === 'completed';
    const editable = canEditMeeting(m);
    const noProgram = KINDS_WITHOUT_PROGRAM.has(m.kind);
    const cls = noProgram ? 'off' : m.kind === 'fast' ? 'fast' : '';
    const header = `<header>
        <b class="day">${parseInt(d.slice(8), 10)}</b>
        <div class="wk-meta">
            <select class="kind-select" data-d="${d}" data-f="kind" aria-label="Tipo de reunião" ${editable ? '' : 'disabled'}>
                ${Object.entries(MEETING_KINDS).map(([k, label]) => `<option value="${k}" ${m.kind === k ? 'selected' : ''}>${label}</option>`).join('')}
            </select>
            ${noProgram ? '' : conductingHtml(m, editable)}
        </div>
    </header>`;
    if (noProgram) {
        return `<article class="wk off" data-d="${d}">${header}
            <div class="wk-off">${escapeHtml(MEETING_KINDS[m.kind])}. Sem reunião sacramental na ala.</div></article>`;
    }
    const missing = missingItems(m);
    const status = done ? `<b>Feita</b>${isLocked(m) && canEdit() ? ` <button type="button" class="link-btn" data-d="${d}" data-act="unlock">Editar</button>` : ''}`
        : missing.length === 0 ? '<b class="ready">Pronta</b>'
            : `<b class="miss" title="${escapeHtml(missing.join(', '))}">Falta ${missing.length}</b>`;
    const bal = balance(speakers(m.program), state.membersById);
    const balTxt = m.kind === 'fast' ? '' : `${bal.men} H, ${bal.women} M${bal.youth ? `, ${bal.youth} ${bal.youth === 1 ? 'jovem' : 'jovens'}` : ''}`;
    return `<article class="wk ${cls} ${isLocked(m) ? 'done' : ''}" data-d="${d}">${header}
        <div class="sec"><h3>Abertura</h3>${hymnRow(m, 'opening_hymn', 'Hino de abertura')}${prayerRow(m, 'invocation', 'Primeira oração')}</div>
        <div class="sec"><h3>${CUP}Sacramento</h3>${hymnRow(m, 'sacrament_hymn', 'Hino sacramental')}</div>
        <div class="sec"><h3>${m.kind === 'fast' ? 'Programa' : 'Oradores'}</h3>${speakersHtml(m, editable)}${hymnRow(m, 'intermediate_hymn', 'Hino intermédio (opcional)')}</div>
        <div class="sec"><h3>Encerramento</h3>${hymnRow(m, 'closing_hymn', 'Hino de encerramento')}${prayerRow(m, 'benediction', 'Última oração')}</div>
        <footer><span>${status}</span><span>${balTxt}</span></footer>
    </article>`;
}

function conductingHtml(m, editable) {
    if (!editable) return m.conducting ? `<span class="dirige">Dirige ${escapeHtml(m.conducting)}</span>` : '';
    return `<input class="dirige-input" data-d="${m.date}" data-f="conducting" value="${escapeHtml(m.conducting || '')}" placeholder="Quem dirige?" aria-label="Quem dirige">`;
}

function speakersHtml(m, editable) {
    if (m.kind === 'fast') return '<div class="row"><span class="n">Testemunhos da congregação</span></div>';
    const sp = speakers(m.program);
    const out = sp.map((s, i) => speakerHtml(m, s, i, editable));
    if (editable) {
        out.push(`<button type="button" class="add-4" data-d="${m.date}" data-act="addspk" data-i="${sp.length}">+ Orador</button>`);
    } else if (!sp.length) {
        out.push('<div class="row empty"><span class="n">Sem oradores</span></div>');
    }
    return out.join('');
}

function removeBtn(m, i) {
    return `<button type="button" class="rm" data-d="${m.date}" data-act="rm-spk" data-i="${i}" title="Remover orador" aria-label="Remover orador">×</button>`;
}

function speakerHtml(m, s, i, editable) {
    const st = s.invite_status || 'to_ask';
    if (!s.name) {
        return editable
            ? `<div class="slot"><button type="button" class="row empty" data-d="${m.date}" data-act="pick-spk" data-i="${i}"><i class="st to_ask"></i><span class="n">Atribuir orador</span></button>${removeBtn(m, i)}</div>`
            : '';
    }
    const member = s.member_id ? state.membersById.get(s.member_id) : null;
    const youth = !s.member_id ? '<span class="tag">visitante</span>' : member?.group === 'Youth' ? '<span class="tag">jovem</span>' : '';
    return `<div class="spk">
        <div class="slot">
            <button type="button" class="assign" data-d="${m.date}" data-act="pick-spk" data-i="${i}" ${editable ? '' : 'disabled'}>
                <span class="n"><i class="st ${st}" title="${INVITE_STATUS[st]}"></i>${escapeHtml(s.name)}${youth}</span>
            </button>
            ${editable ? removeBtn(m, i) : ''}
        </div>
        ${editable
            ? `<input class="topic-input" data-d="${m.date}" data-f="topic" data-i="${i}" value="${escapeHtml(s.topic || '')}" placeholder="tema" aria-label="Tema">
               <div class="status-menu"><span class="small">${INVITE_STATUS[st]}</span>${Object.entries(INVITE_STATUS).map(([k, label]) =>
                `<button type="button" class="${st === k ? 'on' : ''}" data-d="${m.date}" data-act="status" data-i="${i}" data-v="${k}" title="${label}" aria-label="${label}"><i class="st ${k}"></i></button>`).join('')}</div>`
            : (s.topic ? `<span class="topic">${escapeHtml(s.topic)}</span>` : '')}
    </div>`;
}

function prayerRow(m, key, label) {
    const editable = canEditMeeting(m);
    const name = m[key] || state.membersById.get(m[`${key}_member_id`])?.name || '';
    const inner = name
        ? `<i class="st confirmed" title="atribuída"></i><span class="n">${escapeHtml(name)}</span>`
        : `<i class="st to_ask"></i><span class="n">Atribuir</span>`;
    const body = `${inner}<span class="k">${label}</span>`;
    return editable
        ? `<button type="button" class="row ${name ? '' : 'empty'}" data-d="${m.date}" data-act="pick-prayer" data-k="${key}">${body}</button>`
        : `<div class="row ${name ? '' : 'empty'}">${body}</div>`;
}

function hymnRow(m, key, emptyLabel) {
    const editable = canEditMeetingHymns(m);
    const v = m[key];
    if (!v && key === 'intermediate_hymn' && !editable) return '';
    const recent = hymnRepeats(v, m.date);
    const body = v
        ? `<span class="num ${recent ? 'warn' : ''}" ${recent ? 'title="Cantado recentemente"' : ''}>${escapeHtml(hymnNumber(v) || '')}</span><span class="n hy">${escapeHtml(hymnTitle(v))}</span>`
        : `<span class="num">·</span><span class="n">${emptyLabel}</span>`;
    const cls = `row hy-row ${v ? '' : 'empty'} ${key === 'intermediate_hymn' ? 'interm' : ''}`;
    return editable
        ? `<button type="button" class="${cls}" data-d="${m.date}" data-act="pick-hymn" data-k="${key}">${body}</button>`
        : `<div class="${cls}">${body}</div>`;
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

    if (act === 'unlock') {
        unlockMeeting(m.date);
        redrawRow(m);
        return;
    }
    if (act === 'rm-spk') {
        removeSpeaker(m, i);
        changed();
    } else if (act === 'addspk') {
        const target = i;
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
    if (!el.classList.contains('topic-input') && !el.classList.contains('dirige-input')) return;
    const m = meetings.get(el.dataset.d);
    if (el.dataset.f === 'topic') speakers(m.program)[Number(el.dataset.i)].topic = el.value;
    else m[el.dataset.f] = el.value;
    save(m, 900);
}

function rowCell(date, i) {
    return root.querySelector(`.wk[data-d="${date}"] [data-act="pick-spk"][data-i="${i}"]`) || root.querySelector(`.wk[data-d="${date}"]`);
}

function redrawRow(m) {
    const el = root.querySelector(`.wk[data-d="${m.date}"]`);
    if (!el) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = weekHtml(m);
    el.replaceWith(tmp.firstElementChild);
    root.querySelector('#plan-todo').innerHTML = todoHtml();
    root.querySelector('#plan-balance').innerHTML = balanceHtml();
}

function save(m, delay = 250) {
    if (!canEditMeetingHymns(m)) return;
    clearTimeout(saveTimers.get(m.date));
    saveTimers.set(m.date, setTimeout(async () => {
        try {
            if (isMusicOnly()) await DM.saveHymns(m.date, m);
            else await DM.saveFuturePlan(m);
            delete m._new;
            state.meetingsCache.set(m.date, m);
            if (m.status === 'completed') await reloadStats(); // past talks feed the rotation stats
        } catch (e) {
            console.error(e);
            showToast('Não foi possível guardar ' + formatDateShort(m.date) + ': ' + e.message, 'error');
        }
    }, delay));
}
