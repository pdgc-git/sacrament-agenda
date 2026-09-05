// Planner bootstrap + router. Auth state → ward membership → hash-routed views.
// Each view module exports `render(container, params)` and optionally `destroy()`.
import * as Auth from './api/auth.js';
import * as DM from './dataManager.js';
import { state, loadWard, reset } from './app-state.js';
import { showToast } from './components/Toast.js';
import { escapeHtml } from './utils/security.js';
import { closePicker } from './components/picker.js';
import { applyStoredTheme } from './utils/theme.js';
import * as entrada from './views/entrada.js';
import * as plano from './views/plano.js';
import * as domingo from './views/domingo.js';
import * as pulpito from './views/pulpito.js';
import * as ausencias from './views/ausencias.js';
import * as membros from './views/membros.js';
import * as admin from './views/admin.js';

const ROUTES = {
    plano: { view: plano, label: 'Plano' },
    domingo: { view: domingo, label: 'Domingo' },
    pulpito: { view: pulpito, label: 'Púlpito', hideNav: true },
    ausencias: { view: ausencias, label: 'Ausências' },
    membros: { view: membros, label: 'Membros' },
    admin: { view: admin, label: 'Administração', adminOnly: true },
};
const NAV_MOBILE = ['plano', 'domingo', 'ausencias', 'membros'];

let currentView = null;
let ready = false;

document.addEventListener('DOMContentLoaded', () => {
    applyStoredTheme();
    Auth.onAuthChange(onUser);
    window.addEventListener('hashchange', route);
    document.getElementById('nav')?.addEventListener('click', onNavClick);
    document.getElementById('tabbar')?.addEventListener('click', onNavClick);
});

async function onUser(user) {
    const wasUser = state.user;
    if (!user) {
        reset();
        ready = false;
        showAuth();
        return;
    }
    if (wasUser && wasUser.id === user.id && ready) return; // token refresh, nothing to do
    state.user = user;
    try {
        const membership = await DM.initUser(user);
        state.membership = membership;
        if (!membership.hasWard) { showAuth('join'); return; }
        if (membership.status !== 'active') { showAuth('pending'); return; }
        state.role = membership.role;
        await loadWard();
        ready = true;
        hideAuth();
        renderChrome();
        route();
    } catch (e) {
        console.error(e);
        showToast('Erro ao carregar a ala: ' + e.message, 'error');
        showAuth();
    }
}

// ── Auth overlay ─────────────────────────────────────────────────────────────

function showAuth(mode = 'login') {
    const overlay = document.getElementById('auth-overlay');
    overlay.hidden = false;
    document.getElementById('shell').hidden = true;
    entrada.render(overlay, {
        mode,
        user: state.user,
        onSignedIn: () => { /* onAuthChange handles it */ },
        onJoined: async () => { await onUser(state.user); },
        onSignOut: async () => { await Auth.signOut(); },
    });
}

function hideAuth() {
    document.getElementById('auth-overlay').hidden = true;
    document.getElementById('shell').hidden = false;
}

// ── Chrome (sidebar / tabbar) ────────────────────────────────────────────────

function renderChrome() {
    const nav = document.getElementById('nav');
    const entries = Object.entries(ROUTES).filter(([, r]) => !r.hideNav && (!r.adminOnly || ['owner', 'admin'].includes(state.role)));
    nav.innerHTML = entries.map(([key, r]) =>
        `<a class="nav-item" href="#${key}" data-route="${key}"><span class="dot"></span>${r.label}</a>`).join('');
    document.getElementById('brand-ward').textContent = state.ward?.name || '';
    document.getElementById('brand-role').textContent = roleLabel(state.role);
    document.getElementById('user-box').innerHTML =
        `${escapeHtml(state.user?.email || '')}<br><button type="button" class="link-btn" id="btn-signout">Sair</button>`;
    document.getElementById('btn-signout').addEventListener('click', () => Auth.signOut());

    const tabbar = document.getElementById('tabbar');
    tabbar.innerHTML = NAV_MOBILE.map(key =>
        `<button type="button" class="t" data-route="${key}">${ROUTES[key].label}</button>`).join('') +
        (['owner', 'admin'].includes(state.role) ? `<button type="button" class="t" data-route="admin">Admin</button>` : '');
}

function onNavClick(ev) {
    const el = ev.target.closest('[data-route]');
    if (!el) return;
    ev.preventDefault();
    location.hash = '#' + el.dataset.route;
}

function roleLabel(role) {
    return { owner: 'Bispado · proprietário', admin: 'Bispado', editor: 'Editor', music: 'Música', viewer: 'Leitor' }[role] || '';
}

// ── Router ───────────────────────────────────────────────────────────────────

export function parseHash(hash = location.hash) {
    const [name, ...rest] = hash.replace(/^#/, '').split('/');
    return { name: ROUTES[name] ? name : 'domingo', params: rest.filter(Boolean) };
}

async function route() {
    if (!ready) return;
    const { name, params } = parseHash();
    const r = ROUTES[name];
    if (r.adminOnly && !['owner', 'admin'].includes(state.role)) { location.hash = '#domingo'; return; }

    closePicker();
    if (currentView?.destroy) currentView.destroy();
    currentView = r.view;

    document.querySelectorAll('[data-route]').forEach(el => el.classList.toggle('on', el.dataset.route === name));
    document.body.classList.toggle('pulpit-mode', !!r.hideNav);

    const container = document.getElementById('view');
    container.innerHTML = '<div class="loading">A carregar…</div>';
    try {
        await r.view.render(container, params);
    } catch (e) {
        console.error(e);
        container.innerHTML = `<div class="alert bad">Erro: ${escapeHtml(e.message)}</div>`;
    }
    window.scrollTo(0, 0);
}
