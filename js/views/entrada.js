// Entrada: sign in, or join a ward by invite code. No self-signup on this stack.
import * as Auth from '../api/auth.js';
import * as DM from '../dataManager.js';
import { escapeHtml } from '../utils/security.js';
import { showToast } from '../components/Toast.js';

export function render(container, { mode = 'login', user, onJoined, onSignOut }) {
    const tab = mode === 'pending' ? 'pending' : (user ? 'join' : 'login');
    container.innerHTML = `
        <div class="auth-box">
            <div class="center"><div class="glyph" style="width:40px;height:40px;font-size:16px;border-radius:8px;margin:0 auto">A</div></div>
            <h1>Agenda Sacramental</h1>
            <p class="tagline">Planeamento da reunião sacramental</p>
            ${tab === 'pending' ? pendingHtml(user) : (tab === 'join' ? joinHtml(user) : loginHtml())}
        </div>`;

    const form = container.querySelector('form');
    const err = container.querySelector('.auth-error');

    form?.addEventListener('submit', async ev => {
        ev.preventDefault();
        err.textContent = '';
        const btn = form.querySelector('button[type=submit]');
        btn.disabled = true;
        try {
            if (tab === 'login') {
                await Auth.signIn(form.email.value.trim(), form.password.value);
            } else if (tab === 'join') {
                const code = form.code.value.trim().toLowerCase();
                if (code.length < 6) throw new Error('Código de convite incompleto.');
                await DM.joinWard(code);
                showToast('Pedido enviado. O bispado tem de aprovar o acesso.', 'success');
                onJoined();
            }
        } catch (e) {
            err.textContent = e.message;
        } finally {
            btn.disabled = false;
        }
    });

    container.querySelector('#btn-forgot')?.addEventListener('click', async ev => {
        ev.preventDefault();
        const email = form.email.value.trim();
        if (!email) { err.textContent = 'Escreva o e-mail primeiro.'; return; }
        try { await Auth.resetPassword(email); showToast('E-mail de recuperação enviado.', 'success'); }
        catch (e) { err.textContent = e.message; }
    });

    container.querySelector('#create-form')?.addEventListener('submit', async ev => {
        ev.preventDefault();
        const name = ev.target.ward_name.value.trim();
        if (name.length < 3) { err.textContent = 'Escreva o nome da ala.'; return; }
        try { await DM.createWard(name); showToast('Ala criada.', 'success'); onJoined(); }
        catch (e) { err.textContent = e.message; }
    });
    container.querySelector('#btn-signout')?.addEventListener('click', onSignOut);
    container.querySelector('#btn-refresh')?.addEventListener('click', onJoined);
}

function loginHtml() {
    return `
        <form novalidate>
            <div class="field"><label for="email">E-mail</label><input class="input" id="email" name="email" type="email" autocomplete="username" required></div>
            <div class="field"><label for="password">Palavra-passe</label><input class="input" id="password" name="password" type="password" autocomplete="current-password" required></div>
            <div class="auth-error" role="alert"></div>
            <button class="btn primary block" type="submit">Entrar</button>
            <p class="center small" style="margin-top:14px"><a href="#" id="btn-forgot" class="muted">Esqueci-me da palavra-passe</a></p>
            <p class="center small muted" style="margin-top:22px">Não há registo público. A conta é criada pelo bispado da sua ala.</p>
        </form>`;
}

function joinHtml(user) {
    return `
        <p class="center small muted">Sessão: ${escapeHtml(user?.email || '')} · <button type="button" class="link-btn" id="btn-signout">Sair</button></p>
        <form novalidate>
            <div class="field" style="margin-top:14px"><label for="code">Código de convite da ala</label>
                <input class="input code-input" id="code" name="code" maxlength="8" autocomplete="off" placeholder="8 carateres"></div>
            <div class="auth-error" role="alert"></div>
            <button class="btn primary block" type="submit">Juntar-me à ala</button>
            <p class="center small muted" style="margin-top:14px">Peça o código a quem já usa a agenda na sua ala. Depois do pedido, o bispado aprova o acesso.</p>
        </form>
        <div class="divider-t">ou</div>
        <form id="create-form" novalidate>
            <div class="field"><label for="ward-name">A sua ala ainda não usa a agenda? Crie-a</label>
                <input class="input" id="ward-name" name="ward_name" placeholder="Nome da ala (ex.: Ala Alvalade)"></div>
            <button class="btn block" type="submit">Criar ala</button>
        </form>`;
}

function pendingHtml(user) {
    return `
        <div class="alert info" style="justify-content:center">Pedido enviado — à espera de aprovação do bispado.</div>
        <p class="center small muted" style="margin-top:16px">${escapeHtml(user?.email || '')}</p>
        <div class="actions" style="justify-content:center; margin-top:14px">
            <button type="button" class="btn" id="btn-refresh">Verificar de novo</button>
            <button type="button" class="btn" id="btn-signout">Sair</button>
        </div>`;
}
