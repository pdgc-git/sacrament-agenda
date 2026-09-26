// Ausências: the list made from the stand each Sunday (replaces the Keep note). One toggle per
// member; only absences are stored. Second half: streaks over the last 8 completed Sundays.
import * as DM from '../dataManager.js';
import { state, canEdit } from '../app-state.js';
import { escapeHtml } from '../utils/security.js';
import { showToast } from '../components/Toast.js';
import { nextSunday, toIsoDate, formatDateShort, formatDateHeading, parseIsoDate } from '../utils/meeting.js';

const WINDOW = 8;
let date = null;
let absent = new Set();
let history = null; // { dates: [iso desc], byMember: Map<member_id, Set<iso>> }
let filter = 'all';
let search = '';
let root = null;

export async function render(container, params) {
    root = container;
    date = params[0] || toIsoDate(lastOrNextSunday());
    const end = date;
    const start = toIsoDate(new Date(parseIsoDate(date).getTime() - 70 * 86400000));
    const [abs, dates, rows] = await Promise.all([
        DM.getAbsences(date),
        DM.getCompletedDates(start, end),
        DM.getAbsencesInRange(start, end),
    ]);
    absent = abs;
    const allDates = Array.from(new Set([...dates, ...(absent.size ? [date] : [])])).sort().reverse().slice(0, WINDOW);
    const byMember = new Map();
    rows.forEach(r => { if (!byMember.has(r.member_id)) byMember.set(r.member_id, new Set()); byMember.get(r.member_id).add(r.meeting_date); });
    history = { dates: allDates, byMember };
    draw();
}

// Sunday view is used during/after the meeting: default to today's Sunday if today is Sunday,
// else the most recent past Sunday.
function lastOrNextSunday() {
    const today = new Date();
    if (today.getDay() === 0) return today;
    const n = nextSunday(today);
    return new Date(n.getFullYear(), n.getMonth(), n.getDate() - 7);
}

export function streak(memberId) {
    // consecutive absences counting back from the most recent Sunday in the window
    let n = 0;
    for (const d of history.dates) {
        if (history.byMember.get(memberId)?.has(d) || (d === date && absent.has(memberId))) n++;
        else break;
    }
    return n;
}

function draw() {
    const threshold = state.settings?.absence_alert_after || 3;
    const prev = toIsoDate(new Date(parseIsoDate(date).getTime() - 7 * 86400000));
    const next = toIsoDate(new Date(parseIsoDate(date).getTime() + 7 * 86400000));
    const inWard = state.members.filter(mb => mb.status !== 'moved');
    const rows = inWard
        .map(mb => ({ mb, s: streak(mb.id), isAbsent: absent.has(mb.id), lastWeek: history.dates[1] ? history.byMember.get(mb.id)?.has(history.dates[1]) : false }))
        .filter(r => filter === 'all' || (filter === 'marked' && r.isAbsent) || (filter === 'lastweek' && r.lastWeek) || (filter === 'streak' && r.s >= 2))
        .filter(r => !search || r.mb.name.toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => (filter === 'streak' ? b.s - a.s : a.mb.name.localeCompare(b.mb.name)));
    const alerts = inWard.filter(mb => streak(mb.id) >= threshold).length;

    root.innerHTML = `<div id="abs-root">
        <div class="view-head">
            <div><h2>Ausências</h2><div class="sub">${escapeHtml(formatDateHeading(date))} · ${absent.size} marcad${absent.size === 1 ? 'o' : 'os'}
                &nbsp;·&nbsp; <a href="#ausencias/${prev}">‹ ${formatDateShort(prev)}</a> &nbsp; <a href="#ausencias/${next}">${formatDateShort(next)} ›</a></div></div>
            <div class="actions"><a class="btn" href="#pulpito/${date}">Púlpito ›</a></div>
        </div>
        ${alerts ? `<div class="alert bad" style="margin-bottom:14px">${alerts} membro${alerts === 1 ? '' : 's'} com ${threshold} ou mais faltas seguidas</div>` : ''}
        <div class="actions" style="margin-bottom:12px">
            <input class="input" id="abs-search" type="search" placeholder="Pesquisar nome…" value="${escapeHtml(search)}" style="max-width:260px">
            <div class="chips">
                ${chip('all', `Todos · ${inWard.length}`)}${chip('lastweek', 'Faltaram a semana passada')}${chip('marked', `Marcados · ${absent.size}`)}${chip('streak', 'Seguidas 2+')}
            </div>
        </div>
        <div class="card tight" style="padding:0 14px">
            ${rows.length === 0 ? '<div class="empty-note">Ninguém.</div>' : ''}
            ${rows.map(r => `
                <button type="button" class="abs-row" data-id="${r.mb.id}" ${canEdit() ? '' : 'disabled'}>
                    <span class="name">${escapeHtml(r.mb.name)}<span class="sub">${sub(r)}</span></span>
                    <span class="dot-row" title="últimos ${history.dates.length} domingos">${history.dates.slice().reverse().map(d =>
                        `<span class="${(history.byMember.get(r.mb.id)?.has(d) || (d === date && r.isAbsent)) ? 'absent' : 'present'}"></span>`).join('')}</span>
                    ${r.s >= threshold ? `<span class="pill bad">${r.s}</span>` : (r.s >= 2 ? `<span class="pill warn">${r.s}</span>` : '')}
                    <span class="tog ${r.isAbsent ? 'on' : ''}" aria-hidden="true"></span>
                </button>`).join('')}
        </div>
        <p class="small muted" style="margin-top:10px">Só se guarda quem foi marcado ausente; quem não foi marcado conta como presente. As faltas seguidas contam sobre os domingos com reunião terminada.</p>
    </div>`;

    const wrap = root.querySelector('#abs-root');
    wrap.addEventListener('click', onClick);
    wrap.querySelector('#abs-search').addEventListener('input', ev => { search = ev.target.value; redrawKeepFocus(); });
}

function chip(key, label) { return `<button type="button" class="chip ${filter === key ? 'on' : ''}" data-filter="${key}">${label}</button>`; }

function sub(r) {
    if (r.s >= 2) return `faltou ${r.s} domingos seguidos`;
    if (r.lastWeek) return 'faltou a semana passada';
    return '';
}

function redrawKeepFocus() {
    const pos = root.querySelector('#abs-search')?.selectionStart;
    draw();
    const inp = root.querySelector('#abs-search');
    inp.focus(); inp.setSelectionRange(pos, pos);
}

async function onClick(ev) {
    const f = ev.target.closest('[data-filter]');
    if (f) { filter = f.dataset.filter; draw(); return; }
    const row = ev.target.closest('.abs-row');
    if (!row || !canEdit()) return;
    const id = row.dataset.id;
    const nowAbsent = !absent.has(id);
    if (nowAbsent) absent.add(id); else absent.delete(id);
    row.querySelector('.tog').classList.toggle('on', nowAbsent);
    try {
        await DM.setAbsence(date, id, nowAbsent);
        draw();
    } catch (e) {
        if (nowAbsent) absent.delete(id); else absent.add(id);
        showToast('Não foi possível guardar: ' + e.message, 'error');
        draw();
    }
}
