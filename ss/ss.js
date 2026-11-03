// Sociedade de Socorro — test page. Standalone (no login, no server): fictitious data kept in this
// browser's localStorage, so the presidency can try the flow before any real data is involved.
// Reuses the planner's look (planner.css) and helpers; the real module would move to Supabase.
import { escapeHtml as esc } from '../js/utils/security.js';
import { showToast } from '../js/components/Toast.js';
import { applyStoredTheme, toggleTheme } from '../js/utils/theme.js';
import { seed, ZONES, CATEGORIES, VISITS, DEFAULT_TEMPLATES } from './data.js';
import {
    iso, parse, addDays, lastSunday, recordedUpTo, absenceStreak, returnedAfter, pairMessages, isPaused,
    birthdaysInMonth, birthdayTemplateIndex, fill, firstName, shiftMonth, projectAssignments, projectOffset, waLink, joinNames,
} from './logic.js';

const KEY = 'ss-teste-v1';
const ROLE_KEY = 'ss-teste-role';
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

const ROLES = {
    presidencia: { label: 'Presidência da SS', routes: ['inicio', 'frequencia', 'mensagens', 'aniversarios', 'projeto', 'irmas', 'definicoes'] },
    secretaria: { label: 'Secretária', routes: ['inicio', 'frequencia', 'mensagens', 'irmas'] },
    bispado: { label: 'Bispado (só ver)', routes: ['inicio', 'frequencia', 'mensagens', 'aniversarios', 'projeto', 'irmas', 'definicoes'], readOnly: true },
    'org:Primária': { label: 'Líder da Primária', routes: ['projeto'], org: 'Primária' },
    'org:Moças': { label: 'Líder das Moças', routes: ['projeto'], org: 'Moças' },
    'org:Rapazes': { label: 'Líder dos Rapazes', routes: ['projeto'], org: 'Rapazes' },
};
const ROUTES = {
    inicio: 'Hoje', frequencia: 'Frequência', mensagens: 'Mensagens', aniversarios: 'Aniversários',
    projeto: 'Ninguém faz anos sozinho', irmas: 'Irmãs e duplas', definicoes: 'Definições',
};
const TAB_LABELS = { projeto: 'Projeto', irmas: 'Irmãs', definicoes: 'Definições' };

let db = load();
let role = loadRole();
const view = document.getElementById('view');
const today = iso(new Date());

// ── Storage ──────────────────────────────────────────────────────────────────

function load() {
    try {
        const raw = localStorage.getItem(KEY);
        if (raw) return JSON.parse(raw);
    } catch { /* storage unavailable or corrupt → fresh seed */ }
    return seed();
}
function save() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* private mode: keeps working in memory */ }
}
function loadRole() {
    try { const r = localStorage.getItem(ROLE_KEY); if (r && ROLES[r]) return r; } catch { /* ignore */ }
    return 'presidencia';
}
function setRole(r) {
    role = r;
    try { localStorage.setItem(ROLE_KEY, r); } catch { /* ignore */ }
    const allowed = ROLES[role].routes;
    if (!allowed.includes(currentRoute()[0])) location.hash = '#' + allowed[0];
    else render();
}
const readOnly = () => !!ROLES[role].readOnly;

// ── Formatting ───────────────────────────────────────────────────────────────

const fmtShort = s => { const d = parse(s); return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`; };
const fmtLong = s => { const d = parse(s); return `${d.getDate()} de ${MONTHS[d.getMonth()]}`; };
const fmtDay = s => { const d = parse(s); return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`; };
const fmtMonth = ym => { const [y, m] = ym.split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; };
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const byId = id => db.sisters.find(s => s.id === id) || db.brothers.find(b => b.id === id);
const pairById = id => db.pairs.find(p => p.id === id);
const pairName = p => p ? joinNames(p.ministers.map(id => firstName(byId(id)?.name))) : '—';
const activeSisters = () => db.sisters.filter(s => s.status !== 'moved');

function waBtn(text, label, extra = '') {
    return `<a class="btn tiny primary" href="${esc(waLink(text))}" target="_blank" rel="noopener" ${extra}>${esc(label)}</a>`;
}

// ── Router ───────────────────────────────────────────────────────────────────

function currentRoute() {
    const parts = location.hash.replace(/^#/, '').split('/').filter(Boolean);
    return parts.length ? parts : [ROLES[role].routes[0]];
}

function render() {
    const [route, ...params] = currentRoute();
    const allowed = ROLES[role].routes;
    const r = allowed.includes(route) ? route : allowed[0];
    drawNav(r);
    const fn = { inicio: vInicio, frequencia: vFrequencia, mensagens: vMensagens, aniversarios: vAniversarios, projeto: vProjeto, irmas: vIrmas, definicoes: vDefinicoes }[r];
    view.innerHTML = fn(params);
    window.scrollTo(0, 0);
}

function drawNav(active) {
    const routes = ROLES[role].routes;
    document.getElementById('nav').innerHTML = routes.map(k =>
        `<a class="nav-item ${k === active ? 'on' : ''}" href="#${k}">${ROUTES[k]}</a>`).join('');
    document.getElementById('tabbar').innerHTML = routes.length > 1 ? routes.map(k =>
        `<a class="t ${k === active ? 'on' : ''}" href="#${k}">${TAB_LABELS[k] || ROUTES[k]}</a>`).join('') : '';
    document.getElementById('brand-role').textContent = ROLES[role].label;
    document.getElementById('role-select').value = role;
}

// ── Hoje ─────────────────────────────────────────────────────────────────────

function vInicio() {
    const last = lastSunday();
    const saved = !!db.attendance[last];
    const ym = today.slice(0, 7);
    const todayBdays = birthdaysInMonth(db.sisters, ym).filter(b => b.date === today);
    const tomorrow = addDays(today, 1);
    const tomorrowBdays = birthdaysInMonth(db.sisters, tomorrow.slice(0, 7)).filter(b => b.date === tomorrow);
    const lastSaved = recordedUpTo(db.attendance, last)[0];
    const { messages, alerts } = lastSaved ? pairMessages(db, lastSaved) : { messages: [], alerts: [] };
    const pending = messages.filter(m => !db.sent[`${lastSaved}:${m.pair.id}`]).length;

    return `<div class="view-head"><div><h2>Hoje</h2><div class="sub">${cap(fmtDay(today))}</div></div></div>
    <div class="ss-stack">
        ${!saved ? `<a class="ss-task" href="#frequencia/${last}"><b>Lançar a frequência de ${fmtShort(last)}</b><span>A lista de domingo ainda não foi guardada.</span><i>›</i></a>` : ''}
        ${pending ? `<a class="ss-task" href="#mensagens/${lastSaved}"><b>${pending} mensage${pending === 1 ? 'm' : 'ns'} às ministradoras por enviar</b><span>Faltas de ${fmtShort(lastSaved)}</span><i>›</i></a>` : ''}
        ${alerts.length ? `<div class="alert bad">${alerts.length} irmã${alerts.length === 1 ? '' : 's'} com 4 ou mais faltas seguidas: ${esc(joinNames(alerts.map(a => a.sister.name)))}</div>` : ''}
        <section class="card">
            <div class="g-head"><b>Aniversários hoje</b><a class="link-btn" href="#aniversarios">Ver o mês</a></div>
            ${todayBdays.length ? todayBdays.map(b => birthdayRow(b, true)).join('') : '<div class="empty-note">Ninguém faz anos hoje.</div>'}
            ${tomorrowBdays.length ? `<div class="lbl" style="margin-top:14px">Amanhã</div>${tomorrowBdays.map(b => eveRow(b)).join('')}` : ''}
        </section>
    </div>`;
}

// ── Frequência ───────────────────────────────────────────────────────────────

function vFrequencia(params) {
    const date = params[0] || lastSunday();
    const saved = db.attendance[date];
    const draft = db.draft[date] || saved || [];
    const present = new Set(draft);
    const prev = addDays(date, -7);
    const next = addDays(date, 7);
    const ro = readOnly();
    const zones = ZONES.map(z => ({ z, list: activeSisters().filter(s => s.zone === z).sort((a, b) => a.name.localeCompare(b.name)) }));

    return `<div class="view-head"><div><h2>Frequência</h2>
        <div class="sub">${cap(fmtDay(date))} · <a href="#frequencia/${prev}">‹ ${fmtShort(prev)}</a> &nbsp; ${next <= lastSunday() ? `<a href="#frequencia/${next}">${fmtShort(next)} ›</a>` : ''}</div></div>
        <div class="ss-total"><b id="present-count">${present.size}</b><span>presentes</span></div>
    </div>
    ${saved ? `<div class="alert info" style="margin-bottom:14px">Guardada. Total para o site da Igreja: <b>&nbsp;${saved.length}</b>&nbsp; <button class="link-btn" data-act="copy-total" data-v="${saved.length}">Copiar</button></div>` : ''}
    <div class="card tight ss-att" data-date="${date}">
        ${zones.map(({ z, list }) => `<div class="ss-zone">${esc(z)} <span class="muted">· ${list.filter(s => present.has(s.id)).length}/${list.length}</span></div>
            ${list.map(s => {
                const st = absenceStreak(db.attendance, s.id, addDays(date, -1));
                const sub = st >= 2 ? `faltou ${st} domingos seguidos` : st === 1 ? 'faltou no domingo anterior' : '';
                return `<button type="button" class="abs-row" data-act="toggle" data-id="${s.id}" ${ro ? 'disabled' : ''}>
                    <span class="name">${esc(s.name)}<span class="sub">${sub}</span></span>
                    ${dots(s.id, date)}
                    <span class="tog present ${present.has(s.id) ? 'on' : ''}" aria-label="${present.has(s.id) ? 'presente' : 'ausente'}"></span>
                </button>`;
            }).join('')}`).join('')}
    </div>
    ${ro ? '' : `<div class="ss-savebar"><button class="btn primary" data-act="save-att" data-date="${date}">${saved ? 'Guardar alterações' : 'Guardar frequência'}</button>
        <span class="small muted">Toque em quem esteve presente. Quem não for marcada fica ausente.</span></div>`}
    ${statsHtml(date)}`;
}

function dots(id, date) {
    const ds = recordedUpTo(db.attendance, addDays(date, -1)).slice(0, 8).reverse();
    return `<span class="dot-row" title="últimos domingos">${ds.map(d => `<span class="${db.attendance[d].includes(id) ? 'present' : 'absent'}" title="${fmtShort(d)}"></span>`).join('')}</span>`;
}

function statsHtml(date) {
    const ds = recordedUpTo(db.attendance, date).slice(0, 12).reverse();
    if (!ds.length) return '';
    const max = Math.max(activeSisters().length, 1);
    const back = activeSisters().map(s => ({ s, n: returnedAfter(db.attendance, s.id, ds[ds.length - 1]) })).filter(x => x.n);
    const year = date.slice(0, 4);
    const yearDs = Object.keys(db.attendance).filter(d => d.startsWith(year));
    const avg = yearDs.length ? Math.round(yearDs.reduce((a, d) => a + db.attendance[d].length, 0) / yearDs.length) : 0;
    return `<div class="ss-grid2" style="margin-top:22px">
        <section class="card">
            <div class="g-head"><b>Presenças por domingo</b><span class="small muted">média ${year}: ${avg}</span></div>
            <div class="ss-bars">${ds.map(d => `<div class="bar" title="${fmtShort(d)}: ${db.attendance[d].length}"><span style="height:${Math.round(db.attendance[d].length / max * 100)}%"></span><em>${db.attendance[d].length}</em><small>${fmtShort(d)}</small></div>`).join('')}</div>
        </section>
        <section class="card">
            <div class="g-head"><b>Voltaram</b><span class="small muted">${fmtShort(ds[ds.length - 1])}</span></div>
            ${back.length ? back.map(x => `<div class="row-kv"><span class="v">${esc(x.s.name)}</span><span class="pill ok">depois de ${x.n} faltas</span></div>`).join('') : '<div class="empty-note">Ninguém voltou depois de várias faltas neste domingo.</div>'}
        </section>
    </div>`;
}

// ── Mensagens ────────────────────────────────────────────────────────────────

function vMensagens(params) {
    const recorded = recordedUpTo(db.attendance, lastSunday());
    const date = params[0] || recorded[0];
    if (!date || !db.attendance[date]) {
        return `<div class="view-head"><div><h2>Mensagens</h2></div></div><div class="empty-note">Guarde primeiro a frequência de um domingo.</div>`;
    }
    const { messages, skipped, alerts } = pairMessages(db, date);
    const sentCount = messages.filter(m => db.sent[`${date}:${m.pair.id}`]).length;
    const ro = readOnly();
    return `<div class="view-head"><div><h2>Mensagens a enviar</h2>
        <div class="sub">Faltas de ${fmtLong(date)} · ${sentCount}/${messages.length} enviadas
        &nbsp;·&nbsp; <select class="input ss-inline" data-act="msg-date">${recorded.slice(0, 12).map(d => `<option value="${d}" ${d === date ? 'selected' : ''}>${fmtShort(d)}</option>`).join('')}</select></div></div></div>
    ${alerts.length ? `<section class="card ss-alert-card"><div class="g-head"><b>Aviso para a presidência</b><span class="pill bad">4+ faltas</span></div>
        ${alerts.map(a => `<div class="row-kv"><span class="v">${esc(a.sister.name)} <span class="muted small">· ${esc(a.sister.zone)} · ${CATEGORIES[a.sister.category]}</span></span><span class="pill bad">${a.streak} seguidas</span></div>`).join('')}</section>` : ''}
    <div class="ss-stack">
    ${messages.length ? messages.map(m => {
        const key = `${date}:${m.pair.id}`;
        const sent = !!db.sent[key];
        return `<section class="card ss-msg ${sent ? 'sent' : ''}">
            <div class="g-head"><b>${esc(pairName(m.pair))}</b><span class="small muted">${esc(m.absentees.map(a => `${firstName(a.sister.name)} (${a.streak})`).join(', '))}</span></div>
            <p class="ss-text">${esc(m.text)}</p>
            <div class="actions">
                ${m.ministers.map(mi => waBtn(m.text, 'WhatsApp ' + firstName(mi.name), ro ? '' : `data-act="mark-sent" data-k="${key}"`)).join('')}
                <button class="btn tiny" data-act="copy" data-text="${esc(m.text)}">Copiar</button>
                ${ro ? '' : `<button class="btn tiny ${sent ? 'ok' : ''}" data-act="toggle-sent" data-k="${key}">${sent ? '✓ Enviada' : 'Marcar enviada'}</button>`}
            </div>
        </section>`;
    }).join('') : '<div class="empty-note">Nenhuma mensagem para este domingo.</div>'}
    </div>
    ${skipped.length ? `<section class="card" style="margin-top:14px"><div class="g-head"><b>Sem mensagem</b></div>
        ${skipped.map(x => `<div class="row-kv"><span class="v">${esc(x.sister.name)}</span><span class="small muted">${esc(x.reason.startsWith('pausada') ? 'pausada até ' + fmtShort(x.sister.pausedUntil) : x.reason)}</span></div>`).join('')}</section>` : ''}
    <p class="small muted" style="margin-top:12px">Uma mensagem por dupla, mesmo que faltem duas irmãs. O texto muda com as faltas seguidas (1 · 2 a 3 · 4 ou mais) e edita-se em Definições.
    Nesta versão de teste o WhatsApp abre sem destinatária (os números são fictícios); na versão real abre a conversa da ministradora.</p>`;
}

// ── Aniversários ─────────────────────────────────────────────────────────────

function birthdayText(b) {
    const list = db.templates.birthday;
    const t = list[birthdayTemplateIndex(b.person.id, Number(b.date.slice(0, 4)), list.length)] || '';
    return fill(t, { nome: firstName(b.person.name) });
}

function birthdayRow(b, withButton) {
    const key = `${b.date.slice(0, 4)}:${b.person.id}`;
    const sent = !!db.sent[key];
    const isToday = b.date === today;
    const text = birthdayText(b);
    return `<div class="ss-bday ${isToday ? 'today' : ''}">
        <div class="when"><b>${parse(b.date).getDate()}</b><span>${WEEKDAYS[parse(b.date).getDay()].slice(0, 3)}</span></div>
        <div class="who"><b>${esc(b.person.name)}</b><span class="small muted">${b.age} anos · ${esc(b.person.zone)} · visitas: ${VISITS[b.person.visits]}${b.person.pairId ? ' · dupla ' + esc(pairName(pairById(b.person.pairId))) : ''}</span>
            ${withButton || isToday ? `<span class="ss-text small">${esc(text)}</span>` : ''}</div>
        <div class="actions">${withButton || isToday ? `${waBtn(text, 'WhatsApp', readOnly() ? '' : `data-act="mark-sent" data-k="${key}"`)}${sent ? '<span class="pill ok">enviada</span>' : ''}` : ''}</div>
    </div>`;
}

function eveRow(b) {
    const pair = pairById(b.person.pairId);
    if (!pair) return birthdayRow(b, false);
    const text = fill(db.templates.eve, { ministradoras: pairName(pair), irma: firstName(b.person.name) });
    return `<div class="ss-bday"><div class="when"><b>${parse(b.date).getDate()}</b><span>${WEEKDAYS[parse(b.date).getDay()].slice(0, 3)}</span></div>
        <div class="who"><b>${esc(b.person.name)}</b><span class="small muted">lembrete às ministradoras (${esc(pairName(pair))})</span><span class="ss-text small">${esc(text)}</span></div>
        <div class="actions">${waBtn(text, 'Lembrete')}</div></div>`;
}

function vAniversarios(params) {
    const ym = /^\d{4}-\d{2}$/.test(params[0] || '') ? params[0] : today.slice(0, 7);
    const list = birthdaysInMonth(db.sisters, ym);
    const tomorrow = addDays(today, 1);
    return `<div class="view-head"><div><h2>Aniversários</h2>
        <div class="sub"><a href="#aniversarios/${shiftMonth(ym, -1)}">‹</a> &nbsp;${cap(fmtMonth(ym))}&nbsp; <a href="#aniversarios/${shiftMonth(ym, 1)}">›</a> · ${list.length} irmã${list.length === 1 ? '' : 's'}</div></div></div>
    <section class="card">
        ${list.length ? list.map(b => (b.date === tomorrow ? eveRow(b) : birthdayRow(b, false))).join('') : '<div class="empty-note">Ninguém faz anos neste mês.</div>'}
    </section>
    <p class="small muted" style="margin-top:12px">No dia, o aviso aparece em Hoje com a mensagem pronta. As ${db.templates.birthday.length} mensagens alternam entre irmãs e anos e editam-se em Definições.
    Na véspera aparece um lembrete para as ministradoras.</p>`;
}

// ── Projeto: ninguém faz anos sozinho ───────────────────────────────────────

function vProjeto(params) {
    const nextYm = shiftMonth(today.slice(0, 7), 1);
    const ym = /^\d{4}-\d{2}$/.test(params[0] || '') ? params[0] : nextYm;
    const people = [...db.sisters, ...db.brothers];
    const { minAge, orgs, projectStart } = db.settings;
    const offset = projectOffset(people, ym, minAge, projectStart);
    const org = ROLES[role].org;
    const all = projectAssignments(people, ym, minAge, orgs, offset);
    const list = org ? all.filter(a => a.org === org) : all;
    const ro = readOnly();

    return `<div class="view-head"><div><h2>Ninguém faz anos sozinho</h2>
        <div class="sub"><a href="#projeto/${shiftMonth(ym, -1)}">‹</a> &nbsp;${cap(fmtMonth(ym))}&nbsp; <a href="#projeto/${shiftMonth(ym, 1)}">›</a>
        · ${org ? `o que calhou ${{ 'Primária': 'à Primária', 'Moças': 'às Moças', 'Rapazes': 'aos Rapazes' }[org] || 'a ' + esc(org)}` : `${minAge}+ anos · irmãs e irmãos`}</div></div></div>
    ${org ? '' : `<div class="alert info" style="margin-bottom:14px">No início de cada mês aparecem os aniversários do mês seguinte, atribuídos em rotação: ${esc(orgs.join(' → '))}.</div>`}
    <section class="card">
        ${list.length ? list.map(a => {
            const key = `${a.date}:${a.person.id}`;
            const done = !!db.projectDone[key];
            return `<div class="ss-bday">
                <div class="when"><b>${parse(a.date).getDate()}</b><span>${WEEKDAYS[parse(a.date).getDay()].slice(0, 3)}</span></div>
                <div class="who"><b>${esc(a.person.name)}</b><span class="small muted">${esc(a.person.zone)}${org ? '' : ` · ${a.age} anos · visitas: ${VISITS[a.person.visits]}`}</span>
                    ${!org ? '' : `<span class="small">Postal, desenho ou pequena prenda${a.person.visits === 'yes' ? ' · aceita visitas' : a.person.visits === 'no' ? ' · <b>prefere não receber visitas</b>' : ' · perguntar antes se aceita visita'}</span>`}</div>
                <div class="actions">${org ? '' : `<span class="pill accent">${esc(a.org)}</span>`}
                    <button class="btn tiny ${done ? 'ok' : ''}" data-act="project-done" data-k="${key}" ${ro ? 'disabled' : ''}>${done ? '✓ Feito' : 'Marcar feito'}</button></div>
            </div>`;
        }).join('') : '<div class="empty-note">Nenhum aniversário neste mês.</div>'}
    </section>
    <p class="small muted" style="margin-top:12px">Visitas das crianças e dos jovens sempre com dois adultos, e perguntar antes a cada pessoa se gosta de receber visitas.
    ${org ? 'Só vê o nome, a data, a localidade e o que calhou à sua organização.' : 'Os irmãos vêm do quórum de élderes. A idade mínima muda em Definições.'}</p>`;
}

// ── Irmãs e duplas ───────────────────────────────────────────────────────────

function vIrmas(params) {
    const open = params[0];
    const ro = readOnly();
    const sisters = activeSisters().sort((a, b) => a.name.localeCompare(b.name));
    return `<div class="view-head"><div><h2>Irmãs e duplas</h2><div class="sub">${sisters.length} irmãs · ${db.pairs.length} duplas</div></div>
        <div class="actions"><button class="btn" disabled title="Na versão real importa o ficheiro Irmas_SS_Ala_Leiria1.xlsx">Importar Excel</button></div></div>
    <section class="card tight" style="padding:0 14px; overflow-x:auto">
        <table class="table ss-table"><thead><tr><th>Nome</th><th>Zona</th><th>Categoria</th><th>Dupla</th><th>Aniversário</th><th></th></tr></thead><tbody>
        ${sisters.map(s => `<tr class="${open === s.id ? 'open' : ''}">
            <td><b>${esc(s.name)}</b>${!s.canMinister ? ' <span class="pill">não ministrar</span>' : ''}${isPaused(s, today) ? ` <span class="pill warn">pausada até ${fmtShort(s.pausedUntil)}</span>` : ''}<div class="small muted">${esc(s.phone)}</div></td>
            <td>${esc(s.zone)}</td><td>${CATEGORIES[s.category]}</td><td>${esc(pairName(pairById(s.pairId)))}</td><td>${fmtShort(s.birth.replace(/^\d{4}/, today.slice(0, 4)))}</td>
            <td>${ro ? '' : `<a class="link-btn" href="#irmas/${open === s.id ? '' : s.id}">${open === s.id ? 'Fechar' : 'Editar'}</a>`}</td></tr>
            ${open === s.id && !ro ? `<tr class="ss-edit"><td colspan="6">${editForm(s)}</td></tr>` : ''}`).join('')}
        </tbody></table>
    </section>
    <h3 class="ss-h3">Duplas</h3>
    <div class="ss-pairs">${db.pairs.map(p => `<section class="card"><div class="g-head"><b>${esc(pairName(p))}</b></div>
        ${db.sisters.filter(s => s.pairId === p.id && s.status !== 'moved').map(s => `<div class="row-kv"><span class="v">${esc(s.name)}</span><span class="small muted">${esc(s.zone)}</span></div>`).join('') || '<div class="empty-note">Sem irmãs.</div>'}
    </section>`).join('')}</div>`;
}

function editForm(s) {
    const opt = (obj, cur) => Object.entries(obj).map(([k, v]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${v}</option>`).join('');
    return `<form class="ss-form" data-id="${s.id}">
        <label>Nome<input class="input" name="name" value="${esc(s.name)}"></label>
        <label>Telemóvel<input class="input" name="phone" value="${esc(s.phone)}"></label>
        <label>Nascimento<input class="input" type="date" name="birth" value="${s.birth}"></label>
        <label>Zona<select class="input" name="zone">${ZONES.map(z => `<option ${z === s.zone ? 'selected' : ''}>${esc(z)}</option>`).join('')}</select></label>
        <label>Categoria<select class="input" name="category">${opt(CATEGORIES, s.category)}</select></label>
        <label>Dupla que a ministra<select class="input" name="pairId"><option value="">—</option>${db.pairs.map(p => `<option value="${p.id}" ${p.id === s.pairId ? 'selected' : ''}>${esc(pairName(p))}</option>`).join('')}</select></label>
        <label>Pode ser ministrada<select class="input" name="canMinister"><option value="1" ${s.canMinister ? 'selected' : ''}>sim</option><option value="0" ${s.canMinister ? '' : 'selected'}>não</option></select></label>
        <label>Visitas no aniversário<select class="input" name="visits">${opt(VISITS, s.visits)}</select></label>
        <label>Pausar mensagens até<input class="input" type="date" name="pausedUntil" value="${s.pausedUntil || ''}"></label>
        <div class="actions" style="grid-column:1/-1">
            <button class="btn primary" type="submit">Guardar</button>
            <button class="btn danger" type="button" data-act="moved" data-id="${s.id}" title="Apaga os dados de quem sai da ala">Saiu da ala</button>
        </div>
    </form>`;
}

// ── Definições ───────────────────────────────────────────────────────────────

function vDefinicoes() {
    const ro = readOnly() ? 'disabled' : '';
    const t = db.templates;
    return `<div class="view-head"><div><h2>Definições</h2><div class="sub">Textos das mensagens e regras do projeto</div></div></div>
    <form class="ss-settings" id="settings-form">
    <section class="card"><div class="g-head"><b>Mensagens às ministradoras</b></div>
        <p class="small muted">Use {ministradoras}, {irma}, {semanas}. «A vossa irmã / As vossas irmãs» é {vossa}; {esteve}, {lhe} e {ela} mudam sozinhos para o plural.</p>
        <label class="lbl">1 falta</label><textarea class="input" name="abs-one" rows="3" ${ro}>${esc(t.absence.one)}</textarea>
        <label class="lbl">2 a 3 faltas seguidas</label><textarea class="input" name="abs-two" rows="3" ${ro}>${esc(t.absence.two)}</textarea>
        <label class="lbl">4 ou mais (também avisa a presidência)</label><textarea class="input" name="abs-four" rows="3" ${ro}>${esc(t.absence.four)}</textarea>
    </section>
    <section class="card"><div class="g-head"><b>Mensagens de aniversário</b><span class="small muted">{nome} · uma por linha · ${t.birthday.length}</span></div>
        <textarea class="input" name="bdays" rows="9" ${ro}>${esc(t.birthday.join('\n'))}</textarea>
        <label class="lbl" style="margin-top:12px">Lembrete às ministradoras na véspera</label><textarea class="input" name="eve" rows="2" ${ro}>${esc(t.eve)}</textarea>
    </section>
    <section class="card"><div class="g-head"><b>Ninguém faz anos sozinho</b></div>
        <label class="lbl">Idade mínima</label>
        <select class="input" name="minAge" style="max-width:160px" ${ro}>${[60, 65, 70, 75].map(a => `<option ${a === db.settings.minAge ? 'selected' : ''}>${a}</option>`).join('')}</select>
        <label class="lbl" style="margin-top:12px">Ordem da rotação</label>
        <input class="input" name="orgs" value="${esc(db.settings.orgs.join(', '))}" ${ro}>
    </section>
    ${ro ? '' : '<div class="actions"><button class="btn primary" type="submit">Guardar definições</button><button class="btn" type="button" data-act="reset-templates">Repor textos originais</button></div>'}
    </form>
    <section class="card" style="margin-top:18px"><div class="g-head"><b>Privacidade (para a versão real)</b></div>
        <ul class="ss-list">
            <li>Acesso só com conta e palavra-passe, cada pessoa com o seu perfil (como na agenda).</li>
            <li>Só o necessário: sem moradas completas nem informação de saúde.</li>
            <li>HTTPS e alojamento na União Europeia (servidor na Alemanha).</li>
            <li>Cópias de segurança regulares.</li>
            <li>«Saiu da ala» apaga os dados da irmã.</li>
            <li>Registo de quem alterou o quê.</li>
        </ul>
        <p class="small muted">Esta versão de teste não tem contas: guarda dados fictícios só neste navegador.</p>
        ${readOnly() ? '' : '<button class="btn danger tiny" data-act="reset-all">Repor dados de teste</button>'}
    </section>`;
}

// ── Events ───────────────────────────────────────────────────────────────────

view.addEventListener('click', async ev => {
    const el = ev.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    if (act === 'toggle') {
        const date = el.closest('[data-date]').dataset.date;
        const cur = new Set(db.draft[date] || db.attendance[date] || []);
        const id = el.dataset.id;
        if (cur.has(id)) cur.delete(id); else cur.add(id);
        db.draft[date] = [...cur];
        save();
        el.querySelector('.tog').classList.toggle('on', cur.has(id));
        document.getElementById('present-count').textContent = cur.size;
        return;
    }
    if (act === 'save-att') {
        const date = el.dataset.date;
        db.attendance[date] = db.draft[date] || db.attendance[date] || [];
        delete db.draft[date];
        save();
        showToast(`Guardado: ${db.attendance[date].length} presentes`, 'success');
        location.hash = `#mensagens/${date}`;
        return;
    }
    if (act === 'copy-total' || act === 'copy') {
        try { await navigator.clipboard.writeText(el.dataset.v || el.dataset.text); showToast('Copiado', 'success'); }
        catch { showToast('Não foi possível copiar', 'error'); }
        return;
    }
    if (act === 'mark-sent') { db.sent[el.dataset.k] = true; save(); setTimeout(render, 300); return; }
    if (act === 'toggle-sent') { db.sent[el.dataset.k] = !db.sent[el.dataset.k]; save(); render(); return; }
    if (act === 'project-done') { db.projectDone[el.dataset.k] = !db.projectDone[el.dataset.k]; save(); render(); return; }
    if (act === 'moved') {
        const s = db.sisters.find(x => x.id === el.dataset.id);
        if (!s || !confirm(`Apagar os dados de ${s.name}? (saiu da ala)`)) return;
        db.sisters = db.sisters.filter(x => x.id !== s.id);
        Object.keys(db.attendance).forEach(d => { db.attendance[d] = db.attendance[d].filter(id => id !== s.id); });
        db.pairs.forEach(p => { p.ministers = p.ministers.filter(id => id !== s.id); });
        save(); showToast('Dados apagados', 'success'); location.hash = '#irmas';
        return;
    }
    if (act === 'reset-templates') {
        if (!confirm('Repor os textos originais das mensagens?')) return;
        db.templates = JSON.parse(JSON.stringify(DEFAULT_TEMPLATES)); save(); render(); showToast('Textos repostos', 'success');
        return;
    }
    if (act === 'reset-all') {
        if (!confirm('Apagar tudo o que foi alterado e voltar aos dados de teste?')) return;
        db = seed(); save(); location.hash = '#inicio'; render(); showToast('Dados de teste repostos', 'success');
    }
});

view.addEventListener('change', ev => {
    if (ev.target.dataset.act === 'msg-date') location.hash = '#mensagens/' + ev.target.value;
});

view.addEventListener('submit', ev => {
    ev.preventDefault();
    const f = ev.target;
    const data = Object.fromEntries(new FormData(f));
    if (f.classList.contains('ss-form')) {
        const s = db.sisters.find(x => x.id === f.dataset.id);
        Object.assign(s, {
            name: data.name.trim() || s.name, phone: data.phone.trim(), birth: data.birth || s.birth, zone: data.zone,
            category: data.category, pairId: data.pairId, canMinister: data.canMinister === '1', visits: data.visits, pausedUntil: data.pausedUntil || '',
        });
        save(); showToast('Guardado', 'success'); location.hash = '#irmas';
    } else if (f.id === 'settings-form') {
        db.templates.absence = { one: data['abs-one'], two: data['abs-two'], four: data['abs-four'] };
        db.templates.birthday = data.bdays.split('\n').map(x => x.trim()).filter(Boolean);
        db.templates.eve = data.eve;
        db.settings.minAge = Number(data.minAge);
        const orgs = data.orgs.split(',').map(x => x.trim()).filter(Boolean);
        if (orgs.length) db.settings.orgs = orgs;
        save(); showToast('Definições guardadas', 'success'); render();
    }
});

// ── Boot ─────────────────────────────────────────────────────────────────────

applyStoredTheme();
document.getElementById('theme-btn').addEventListener('click', toggleTheme);
const roleSelect = document.getElementById('role-select');
roleSelect.innerHTML = Object.entries(ROLES).map(([k, r]) => `<option value="${k}">${r.label}</option>`).join('');
roleSelect.addEventListener('change', () => setRole(roleSelect.value));
window.addEventListener('hashchange', render);
render();
