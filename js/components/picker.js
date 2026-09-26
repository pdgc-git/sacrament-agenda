// Ranked, filterable candidate picker used by Plano/Domingo for speakers, prayers and hymns.
// Ranking + filtering are pure functions (tested); `openPicker` is the DOM part.
import { escapeHtml } from '../utils/security.js';
import { formatAgo, formatBalance, formatDateShort, memberAvailability } from '../utils/meeting.js';

export const GROUP_LABELS = { Youth: 'Jovens', 'Young Adult': 'Jovens Adultos', Adult: 'Adultos', Primary: 'Primária' };

/**
 * Rank members for a role. Never-did-it first, then oldest last date. Members currently booked
 * for the same date and members who left the ward are excluded; members who are away go after
 * everyone available, and a member who declined this same meeting is shown last, flagged.
 * @param {Array} members  roster rows {id,name,gender,group}
 * @param {Map} lastDates  member_id -> iso date of last talk/prayer (missing = never)
 * @param {object} filters { gender: 'M'|'F'|null, groups: Set<string>|null, search: '' }
 * @param {object} ctx { excludeIds: Set, declinedIds: Set, recentDays: number, today: Date }
 */
export function rankMembers(members, lastDates, filters = {}, ctx = {}) {
    const today = ctx.today || new Date();
    const exclude = ctx.excludeIds || new Set();
    const declined = ctx.declinedIds || new Set();
    const search = (filters.search || '').trim().toLowerCase();

    return members
        .filter(m => !exclude.has(m.id) && memberAvailability(m, today) !== 'moved')
        .filter(m => !filters.gender || m.gender === filters.gender)
        .filter(m => !filters.groups || filters.groups.size === 0 || filters.groups.has(m.group))
        .filter(m => !search || m.name.toLowerCase().includes(search))
        .map(m => {
            const last = lastDates.get(m.id) || null;
            const days = last ? Math.round((today - new Date(last)) / 86400000) : Infinity;
            const away = memberAvailability(m, today) === 'away';
            return { member: m, last, days, away, declined: declined.has(m.id), recent: days < (ctx.recentDays || 90) };
        })
        .sort((a, b) => {
            if (a.declined !== b.declined) return a.declined ? 1 : -1;
            if (a.away !== b.away) return a.away ? 1 : -1;
            return b.days - a.days; // Infinity (never) first
        });
}

/**
 * Rank hymns: not sung recently first (oldest usage first), never-sung ahead of everything.
 * @param {Array} hymns [{number,title}]
 * @param {Map} lastSung number -> iso date
 * @param {object} opts { search, repeatMonths, today }
 */
export function rankHymns(hymns, lastSung, opts = {}) {
    const today = opts.today || new Date();
    const search = (opts.search || '').trim().toLowerCase();
    const warnDays = (opts.repeatMonths || 3) * 30;
    return hymns
        .filter(h => !search || String(h.number).startsWith(search) || h.title.toLowerCase().includes(search))
        .map(h => {
            const last = lastSung.get(String(h.number)) || null;
            const days = last ? Math.round((today - new Date(last)) / 86400000) : Infinity;
            return { hymn: h, last, days, recent: days < warnDays };
        })
        .sort((a, b) => {
            if (search) return 0; // keep hymnal order when searching by number/title
            return b.days - a.days;
        });
}

/**
 * The name to offer as a non-member ("visitante") entry for what was typed in the search box,
 * or null when nothing usable was typed or it exactly matches a member already on the roster.
 */
export function guestName(search, members = []) {
    const name = String(search || '').trim().replace(/\s+/g, ' ');
    if (name.length < 2) return null;
    const lower = name.toLowerCase();
    return members.some(m => m.name.trim().toLowerCase() === lower) ? null : name;
}

// ── DOM ─────────────────────────────────────────────────────────────────────
// Pickers open as a large centered window (full-screen sheet on phones) so a whole month can be
// planned from them: every candidate shows when they last did it, how often in the last 12 months
// and, for talks, the last topic.

let openEl = null;

export function closePicker() {
    if (openEl) { openEl.remove(); openEl = null; }
    document.removeEventListener('keydown', onKey, true);
}

function onKey(ev) {
    if (ev.key === 'Escape') { ev.preventDefault(); closePicker(); }
}

function mount(el, focusSearch = true) {
    closePicker();
    const backdrop = document.createElement('div');
    backdrop.className = 'picker-backdrop';
    backdrop.appendChild(el);
    backdrop.addEventListener('pointerdown', ev => { if (ev.target === backdrop) closePicker(); });
    el.addEventListener('click', ev => { if (ev.target.closest('[data-act="close"]')) closePicker(); });
    document.body.appendChild(backdrop);
    openEl = backdrop;
    document.addEventListener('keydown', onKey, true);
    if (focusSearch && window.innerWidth >= 640) el.querySelector('.picker-search')?.focus();
}

function shortDate(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return `${d} ${['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][m - 1]} ${y}`;
}

function keepSearchFocus(el, render) {
    return ev => {
        const pos = ev.target.selectionStart;
        render();
        const inp = el.querySelector('.picker-search');
        inp.focus(); inp.setSelectionRange(pos, pos);
    };
}

/**
 * Open a member picker.
 * @param {HTMLElement} _anchor  kept for call compatibility; the window is centered
 * @param {object} cfg {
 *   title, verb ('falou'|'orou'), members, lastDates, excludeIds, declinedIds,
 *   stats (optional Map member_id -> {count12, lastTopic?}), balance (optional {sunday:b, month:b}),
 *   initialFilters, onPick(member), onClear(),
 *   onGuest(name) (optional: lets the typed name be used without registering a member)
 * }
 */
export function openMemberPicker(_anchor, cfg) {
    const filters = { gender: null, groups: new Set(), search: '', ...(cfg.initialFilters || {}) };
    const el = document.createElement('div');
    el.className = 'picker';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', cfg.title || 'Escolher');
    const talks = cfg.verb !== 'orou';

    const render = () => {
        const ranked = rankMembers(cfg.members, cfg.lastDates, filters, {
            excludeIds: cfg.excludeIds, declinedIds: cfg.declinedIds, recentDays: cfg.recentDays,
        });
        const guest = cfg.onGuest ? guestName(filters.search, cfg.members) : null;
        const chip = (label, on, data) => `<button type="button" class="chip${on ? ' on' : ''}" ${data}>${label}</button>`;
        el.innerHTML = `
            <div class="picker-head">
                <div><h3>${escapeHtml(cfg.title || '')}</h3><p>Quem ${talks ? 'falou' : 'orou'} há mais tempo aparece primeiro.</p></div>
                <button type="button" class="x" data-act="close" aria-label="Fechar">×</button>
            </div>
            <div class="picker-tools">
                <input class="picker-search" type="search" placeholder="${cfg.onGuest ? 'Pesquisar ou escrever um nome…' : 'Pesquisar nome…'}" value="${escapeHtml(filters.search)}" autocomplete="off">
                <div class="picker-filters">
                    ${chip('Todos', !filters.gender && filters.groups.size === 0, 'data-f="all"')}
                    ${chip('Homens', filters.gender === 'M', 'data-f="gender" data-v="M"')}
                    ${chip('Mulheres', filters.gender === 'F', 'data-f="gender" data-v="F"')}
                    ${Object.entries(GROUP_LABELS).filter(([g]) => g !== 'Primary').map(([g, label]) =>
                        chip(label, filters.groups.has(g), `data-f="group" data-v="${g}"`)).join('')}
                </div>
            </div>
            ${cfg.balance ? `<div class="picker-balance">Este domingo: <b>${formatBalance(cfg.balance.sunday)}</b><span>Este mês: <b>${formatBalance(cfg.balance.month)}</b></span></div>` : ''}
            <div class="picker-cols ${talks ? '' : 'no-topic'}" aria-hidden="true"><span>Nome</span><span>Última vez</span><span>12 meses</span>${talks ? '<span>Último tema</span>' : ''}</div>
            <div class="picker-list">
                ${guest ? `<button type="button" class="picker-option guest" data-act="guest"><span class="who">Usar «${escapeHtml(guest)}»</span><span class="stat">sem registar como membro</span></button>` : ''}
                ${ranked.length === 0 && !guest ? `<div class="picker-empty">Ninguém com estes filtros.${cfg.onGuest ? ' Escreva o nome de quem não é membro da ala.' : ''}</div>` : ''}
                ${ranked.map((r, i) => {
                    const st = cfg.stats?.get(r.member.id);
                    const top = i === 0 && !r.declined && !r.away;
                    const awayTxt = r.away ? `indisponível${r.member.away_until ? ' até ' + formatDateShort(r.member.away_until) : ''}${r.member.status_note ? ': ' + r.member.status_note : ''}` : '';
                    const meta = [r.member.gender === 'F' ? 'Mulher' : r.member.gender === 'M' ? 'Homem' : '', GROUP_LABELS[r.member.group] || ''].filter(Boolean).join(', ');
                    return `
                    <button type="button" class="picker-option ${talks ? '' : 'no-topic'}${top ? ' top' : ''}${r.recent ? ' risk' : ''}${r.declined ? ' declined' : ''}${r.away ? ' away' : ''}" data-id="${r.member.id}">
                        <span class="who"><b>${escapeHtml(r.member.name)}</b>${top ? '<span class="badge-sugerido">Sugerido</span>' : ''}<small>${escapeHtml(awayTxt || meta)}</small></span>
                        <span class="when">${r.declined ? '<b>recusou este domingo</b>' : r.last ? `<b>há ${escapeHtml(formatAgo(r.last).replace(/^há /, ''))}</b><small>${shortDate(r.last)}</small>` : `<b>nunca ${talks ? 'falou' : 'orou'}</b>`}</span>
                        <span class="count">${st?.count12 ? `${st.count12}×` : '—'}</span>
                        ${talks ? `<span class="topic-col">${escapeHtml(st?.lastTopic || '')}</span>` : ''}
                    </button>`;
                }).join('')}
            </div>
            ${cfg.onClear ? '<div class="picker-foot"><button type="button" class="link-btn" data-act="clear">Limpar atribuição</button><span>Esc para fechar</span></div>' : ''}
        `;
    };

    el.addEventListener('click', ev => {
        const chipEl = ev.target.closest('.chip');
        if (chipEl) {
            const f = chipEl.dataset.f, v = chipEl.dataset.v;
            if (f === 'all') { filters.gender = null; filters.groups.clear(); }
            else if (f === 'gender') filters.gender = filters.gender === v ? null : v;
            else if (f === 'group') { if (filters.groups.has(v)) filters.groups.delete(v); else filters.groups.add(v); }
            filters.search = el.querySelector('.picker-search')?.value || '';
            render();
            return;
        }
        if (ev.target.closest('[data-act="guest"]')) {
            const name = guestName(filters.search, cfg.members);
            closePicker();
            if (name) cfg.onGuest(name);
            return;
        }
        const opt = ev.target.closest('.picker-option');
        if (opt) {
            const member = cfg.members.find(m => m.id === opt.dataset.id);
            closePicker();
            cfg.onPick(member);
            return;
        }
        if (ev.target.closest('[data-act="clear"]')) { closePicker(); cfg.onClear(); }
    });
    const refocus = keepSearchFocus(el, render);
    el.addEventListener('input', ev => {
        if (ev.target.classList.contains('picker-search')) { filters.search = ev.target.value; refocus(ev); }
    });

    render();
    mount(el);
    return el;
}

/**
 * Open a hymn picker. cfg: { title, hymns, lastSung, repeatMonths, onPick(hymn), onClear() }
 */
export function openHymnPicker(_anchor, cfg) {
    const el = document.createElement('div');
    el.className = 'picker hymns';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', cfg.title || 'Hino');
    let search = '';

    const render = () => {
        const ranked = rankHymns(cfg.hymns, cfg.lastSung, { search, repeatMonths: cfg.repeatMonths });
        el.innerHTML = `
            <div class="picker-head">
                <div><h3>${escapeHtml(cfg.title || 'Hino')}</h3><p>${search ? 'Resultados da pesquisa.' : 'Os que não se cantam há mais tempo aparecem primeiro.'}</p></div>
                <button type="button" class="x" data-act="close" aria-label="Fechar">×</button>
            </div>
            <div class="picker-tools"><input class="picker-search" type="search" placeholder="Número ou título…" value="${escapeHtml(search)}" autocomplete="off"></div>
            <div class="picker-list">
                ${ranked.slice(0, 120).map((r, i) => `
                    <button type="button" class="picker-option hymn-opt${i === 0 && !search ? ' top' : ''}${r.recent ? ' risk' : ''}" data-n="${escapeHtml(r.hymn.number)}">
                        <span class="who"><span class="no">${escapeHtml(r.hymn.number)}</span><b>${escapeHtml(r.hymn.title)}</b></span>
                        <span class="when">${r.last ? `<b>cantado há ${escapeHtml(formatAgo(r.last).replace(/^há /, ''))}</b><small>${shortDate(r.last)}</small>` : '<small>sem registo recente</small>'}</span>
                    </button>`).join('')}
            </div>
            ${cfg.onClear ? '<div class="picker-foot"><button type="button" class="link-btn" data-act="clear">Limpar</button><span>Esc para fechar</span></div>' : ''}
        `;
    };
    el.addEventListener('click', ev => {
        const opt = ev.target.closest('.picker-option');
        if (opt) {
            const hymn = cfg.hymns.find(h => String(h.number) === opt.dataset.n);
            closePicker();
            cfg.onPick(hymn);
        } else if (ev.target.closest('[data-act="clear"]')) { closePicker(); cfg.onClear(); }
    });
    const refocus = keepSearchFocus(el, render);
    el.addEventListener('input', ev => {
        if (ev.target.classList.contains('picker-search')) { search = ev.target.value; refocus(ev); }
    });
    render();
    mount(el);
    return el;
}
