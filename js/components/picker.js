// Ranked, filterable candidate picker used by Plano/Domingo for speakers, prayers and hymns.
// Ranking + filtering are pure functions (tested); `openPicker` is the DOM part.
import { escapeHtml } from '../utils/security.js';
import { formatAgo, formatBalance } from '../utils/meeting.js';

export const GROUP_LABELS = { Youth: 'Jovens', 'Young Adult': 'Jovens Adultos', Adult: 'Adultos', Primary: 'Primária' };

/**
 * Rank members for a role. Never-did-it first, then oldest last date. Members currently booked
 * for the same date are excluded; a member who declined this same meeting is shown last, flagged.
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
        .filter(m => !exclude.has(m.id))
        .filter(m => !filters.gender || m.gender === filters.gender)
        .filter(m => !filters.groups || filters.groups.size === 0 || filters.groups.has(m.group))
        .filter(m => !search || m.name.toLowerCase().includes(search))
        .map(m => {
            const last = lastDates.get(m.id) || null;
            const days = last ? Math.round((today - new Date(last)) / 86400000) : Infinity;
            return { member: m, last, days, declined: declined.has(m.id), recent: days < (ctx.recentDays || 90) };
        })
        .sort((a, b) => {
            if (a.declined !== b.declined) return a.declined ? 1 : -1;
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

// ── DOM ─────────────────────────────────────────────────────────────────────

let openEl = null;

export function closePicker() {
    if (openEl) { openEl.remove(); openEl = null; }
    document.removeEventListener('pointerdown', onOutside, true);
}

function onOutside(ev) {
    if (openEl && !openEl.contains(ev.target)) closePicker();
}

/**
 * Open a member picker anchored to `anchor`.
 * @param {HTMLElement} anchor
 * @param {object} cfg {
 *   title, verb ('falou'|'orou'), members, lastDates, excludeIds, declinedIds,
 *   balance (optional {sunday:b, month:b}), initialFilters, onPick(member), onClear()
 * }
 */
export function openMemberPicker(anchor, cfg) {
    closePicker();
    const filters = { gender: null, groups: new Set(), search: '', ...(cfg.initialFilters || {}) };
    const el = document.createElement('div');
    el.className = 'picker';
    el.setAttribute('role', 'dialog');
    openEl = el;

    const render = () => {
        const ranked = rankMembers(cfg.members, cfg.lastDates, filters, {
            excludeIds: cfg.excludeIds, declinedIds: cfg.declinedIds, recentDays: cfg.recentDays,
        });
        const chip = (label, on, data) => `<button type="button" class="chip${on ? ' on' : ''}" ${data}>${label}</button>`;
        el.innerHTML = `
            <div class="picker-head"><span>${escapeHtml(cfg.title || '')}</span><span>há mais tempo primeiro</span></div>
            <div class="picker-filters">
                ${chip('Todos', !filters.gender && filters.groups.size === 0, 'data-f="all"')}
                ${chip('Homens', filters.gender === 'M', 'data-f="gender" data-v="M"')}
                ${chip('Mulheres', filters.gender === 'F', 'data-f="gender" data-v="F"')}
                ${Object.entries(GROUP_LABELS).filter(([g]) => g !== 'Primary').map(([g, label]) =>
                    chip(label, filters.groups.has(g), `data-f="group" data-v="${g}"`)).join('')}
            </div>
            <input class="picker-search" type="search" placeholder="Pesquisar nome…" value="${escapeHtml(filters.search)}" autocomplete="off">
            <div class="picker-list">
                ${ranked.length === 0 ? '<div class="picker-empty">Ninguém com estes filtros.</div>' : ''}
                ${ranked.slice(0, 40).map((r, i) => `
                    <button type="button" class="picker-option${i === 0 && !r.declined ? ' top' : ''}${r.recent ? ' risk' : ''}${r.declined ? ' declined' : ''}" data-id="${r.member.id}">
                        <span class="who">${escapeHtml(r.member.name)}
                            <span class="sex">${r.member.gender || ''}${r.member.group && r.member.group !== 'Adult' ? ' · ' + escapeHtml(GROUP_LABELS[r.member.group] || r.member.group) : ''}</span>
                            ${i === 0 && !r.declined ? '<span class="badge-sugerido">Sugerido</span>' : ''}
                        </span>
                        <span class="stat">${r.declined ? 'recusou este domingo' : (r.last ? `${cfg.verb || 'falou'} ${formatAgo(r.last)}` : `nunca ${cfg.verb === 'orou' ? 'orou' : 'falou'}`)}</span>
                    </button>`).join('')}
            </div>
            ${cfg.balance ? `<div class="picker-foot"><span>Domingo: ${formatBalance(cfg.balance.sunday)}</span><span>Mês: ${formatBalance(cfg.balance.month)}</span></div>` : ''}
            ${cfg.onClear ? '<div class="picker-foot"><button type="button" class="link-btn" data-act="clear">Limpar atribuição</button></div>' : ''}
        `;
    };

    el.addEventListener('click', ev => {
        const chipEl = ev.target.closest('.chip');
        if (chipEl) {
            const f = chipEl.dataset.f, v = chipEl.dataset.v;
            if (f === 'all') { filters.gender = null; filters.groups.clear(); }
            else if (f === 'gender') filters.gender = filters.gender === v ? null : v;
            else if (f === 'group') { if (filters.groups.has(v)) filters.groups.delete(v); else filters.groups.add(v); }
            const s = el.querySelector('.picker-search')?.value || '';
            filters.search = s;
            render();
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
    el.addEventListener('input', ev => {
        if (ev.target.classList.contains('picker-search')) {
            filters.search = ev.target.value;
            const pos = ev.target.selectionStart;
            render();
            const inp = el.querySelector('.picker-search');
            inp.focus(); inp.setSelectionRange(pos, pos);
        }
    });

    render();
    place(anchor, el);
    setTimeout(() => document.addEventListener('pointerdown', onOutside, true), 0);
    return el;
}

/**
 * Open a hymn picker. cfg: { title, hymns, lastSung, repeatMonths, onPick(hymn), onClear() }
 */
export function openHymnPicker(anchor, cfg) {
    closePicker();
    const el = document.createElement('div');
    el.className = 'picker';
    openEl = el;
    let search = '';

    const render = () => {
        const ranked = rankHymns(cfg.hymns, cfg.lastSung, { search, repeatMonths: cfg.repeatMonths });
        el.innerHTML = `
            <div class="picker-head"><span>${escapeHtml(cfg.title || 'Hino')}</span><span>${search ? 'pesquisa' : 'há mais tempo sem cantar primeiro'}</span></div>
            <input class="picker-search" type="search" placeholder="Número ou título…" value="${escapeHtml(search)}" autocomplete="off">
            <div class="picker-list">
                ${ranked.slice(0, 30).map((r, i) => `
                    <button type="button" class="picker-option${i === 0 && !search ? ' top' : ''}${r.recent ? ' risk' : ''}" data-n="${escapeHtml(r.hymn.number)}">
                        <span class="who hymn-plain"><span class="no">${escapeHtml(r.hymn.number)}</span> ${escapeHtml(r.hymn.title)}</span>
                        <span class="stat">${r.last ? `cantado ${formatAgo(r.last)}${r.recent ? ' ⚠' : ''}` : 'não cantado recentemente'}</span>
                    </button>`).join('')}
            </div>
            ${cfg.onClear ? '<div class="picker-foot"><button type="button" class="link-btn" data-act="clear">Limpar</button></div>' : ''}
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
    el.addEventListener('input', ev => {
        if (ev.target.classList.contains('picker-search')) {
            search = ev.target.value;
            const pos = ev.target.selectionStart;
            render();
            const inp = el.querySelector('.picker-search');
            inp.focus(); inp.setSelectionRange(pos, pos);
        }
    });
    render();
    place(anchor, el);
    setTimeout(() => {
        document.addEventListener('pointerdown', onOutside, true);
        el.querySelector('.picker-search')?.focus();
    }, 0);
    return el;
}

// Fixed-position placement under the anchor, kept inside the viewport; full-width sheet on phones.
function place(anchor, el) {
    document.body.appendChild(el);
    if (window.innerWidth < 640) { el.classList.add('sheet'); return; }
    const r = anchor.getBoundingClientRect();
    const w = 340;
    let left = Math.min(r.left, window.innerWidth - w - 12);
    let top = r.bottom + 6;
    el.style.width = w + 'px';
    el.style.left = Math.max(8, left) + 'px';
    el.style.top = top + 'px';
    const h = el.offsetHeight;
    if (top + h > window.innerHeight - 8) el.style.top = Math.max(8, r.top - h - 6) + 'px';
}
