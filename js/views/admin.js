// Administração: ward settings (what prefills Domingo), create accounts / reset passwords (accounts
// service), pending approvals, invite code, roles, theme.
import * as DM from '../dataManager.js';
import { state, canAdmin, reloadSettings } from '../app-state.js';
import { escapeHtml } from '../utils/security.js';
import { showToast } from '../components/Toast.js';
import { setTheme } from '../utils/theme.js';

const ROLE_LABELS = { owner: 'Proprietário', admin: 'Bispado', editor: 'Editor', music: 'Música (só hinos)', viewer: 'Leitor (só ver)' };
let root = null;
let users = [];
let lastCredentials = null; // {name, email, password, created, reset} shown once after create/reset

export async function render(container) {
    root = container;
    users = await DM.getWardUsers();
    draw();
}

function draw() {
    const s = state.settings;
    const pending = users.filter(u => u.status === 'pending');
    const active = users.filter(u => u.status === 'active');
    let theme = 'system';
    try { theme = localStorage.getItem('agenda-theme') || 'system'; } catch { /* ignore */ }

    root.innerHTML = `<div id="adm-root">
        <div class="view-head"><div><h2>Administração</h2><div class="sub">${escapeHtml(state.ward?.name || '')}</div></div></div>
        <div class="two-col">
            <div style="display:flex; flex-direction:column; gap:18px">
                <form class="card" id="settings-form">
                    <div class="section-label" style="margin-bottom:10px">Definições da ala</div>
                    <div class="field"><label for="s-name">Nome da ala</label><input class="input" id="s-name" name="ward_name" value="${escapeHtml(state.ward?.name || '')}"></div>
                    <div class="field"><label for="s-presiding">Preside (por defeito)</label><input class="input" id="s-presiding" name="presiding" value="${escapeHtml(s.presiding || '')}" placeholder="Bispo …"></div>
                    <div class="field"><label for="s-rotation">Dirige — rotação (um por linha, pela ordem)</label><textarea class="input" id="s-rotation" name="conducting_rotation" rows="3" placeholder="Bispo …&#10;Cons. …&#10;Cons. …">${escapeHtml((s.conducting_rotation || []).join('\n'))}</textarea></div>
                    <div class="field"><label for="s-organist">Pianista / Organista</label><input class="input" id="s-organist" name="organist" value="${escapeHtml(s.organist || '')}"></div>
                    <div class="field"><label for="s-chorister">Regente</label><input class="input" id="s-chorister" name="chorister" value="${escapeHtml(s.chorister || '')}"></div>
                    <div class="two-col" style="gap:12px">
                        <div class="field"><label for="s-speakers">Oradores por defeito</label><input class="input" id="s-speakers" name="default_speakers" type="number" min="1" max="6" value="${s.default_speakers ?? 3}"></div>
                        <div class="field"><label for="s-absence">Alerta de faltas (domingos seguidos)</label><input class="input" id="s-absence" name="absence_alert_after" type="number" min="1" max="12" value="${s.absence_alert_after ?? 3}"></div>
                        <div class="field"><label for="s-hymn">Aviso de hino repetido (meses)</label><input class="input" id="s-hymn" name="hymn_repeat_months" type="number" min="1" max="24" value="${s.hymn_repeat_months ?? 3}"></div>
                    </div>
                    <div class="actions" style="justify-content:flex-end"><button type="submit" class="btn primary">Guardar definições</button></div>
                </form>
                <div class="card">
                    <div class="section-label" style="margin-bottom:10px">Pedidos pendentes · ${pending.length}</div>
                    ${pending.length === 0 ? '<div class="empty-note">Sem pedidos.</div>' : ''}
                    ${pending.map(u => `<div class="approval-row" data-uid="${u.user_id}">
                        <div class="avatar">${escapeHtml(initials(u.name || u.email))}</div>
                        <div class="meta"><div class="name">${escapeHtml(u.name || u.email || u.user_id)}</div><div class="sub">${escapeHtml(u.email || '')} · pedido ${escapeHtml(formatAgoTs(u.joined_at))}</div></div>
                        <select class="input" style="width:auto; padding:6px 8px" data-role>
                            ${['editor', 'admin', 'music', 'viewer'].map(r => `<option value="${r}">${ROLE_LABELS[r]}</option>`).join('')}</select>
                        <button type="button" class="btn ok tiny" data-act="approve">Aprovar</button>
                        <button type="button" class="btn tiny" data-act="reject">Recusar</button></div>`).join('')}
                </div>
            </div>
            <div style="display:flex; flex-direction:column; gap:18px">
                ${canAdmin() ? `<form class="card" id="account-form">
                    <div class="section-label" style="margin-bottom:10px">Criar conta</div>
                    <div class="field"><label for="a-name">Nome</label><input class="input" id="a-name" name="name" autocomplete="off" required></div>
                    <div class="field"><label for="a-email">E-mail</label><input class="input" id="a-email" name="email" type="email" autocomplete="off" required></div>
                    <div class="field"><label for="a-role">Papel</label><select class="input" id="a-role" name="role">
                        ${['editor', 'admin', 'music', 'viewer'].map(r => `<option value="${r}">${ROLE_LABELS[r]}</option>`).join('')}</select></div>
                    <div class="actions" style="justify-content:flex-end"><button type="submit" class="btn primary">Criar conta</button></div>
                    <p class="small muted" style="margin-top:8px">A pessoa fica logo com acesso à ala. Recebe uma palavra-passe temporária e escolhe a sua na primeira entrada.</p>
                </form>` : ''}
                ${lastCredentials ? credentialsHtml(lastCredentials) : ''}
                <div class="card">
                    <div class="section-label" style="margin-bottom:10px">Código de convite</div>
                    <div class="invite-code"><span class="code" id="invite-code">${escapeHtml(state.ward?.invite_code || '')}</span>
                        <span class="actions"><button type="button" class="btn tiny" id="btn-copy">Copiar</button><button type="button" class="btn tiny" id="btn-regen">Regenerar</button></span></div>
                    <p class="small muted" style="margin-top:8px">Para quem já tem conta noutra ala ou noutra aplicação deste servidor: entra e junta-se com este código, e aprova-se em Pedidos pendentes. Regenerar invalida o código antigo.</p>
                </div>
                <div class="card">
                    <div class="section-label" style="margin-bottom:6px">Acessos</div>
                    ${active.map(u => `<div class="row-kv" data-uid="${u.user_id}">
                        <span class="v" style="font-weight:400">${escapeHtml(u.name || u.email || u.user_id)}</span>
                        ${u.role === 'owner' || !canAdmin()
                            ? `<span class="badge ${u.role === 'owner' ? 'owner' : ''}">${ROLE_LABELS[u.role]}</span>`
                            : `<select class="input" style="width:auto; padding:4px 8px" data-setrole>${['admin', 'editor', 'music', 'viewer'].map(r => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${ROLE_LABELS[r]}</option>`).join('')}</select>
                               ${u.managed && u.user_id !== state.user?.id ? '<button type="button" class="btn tiny" data-act="reset">Repor palavra-passe</button>' : ''}
                               <button type="button" class="x" data-act="remove" title="Remover acesso">✕</button>`}
                    </div>`).join('')}
                </div>
                <div class="card">
                    <div class="section-label" style="margin-bottom:10px">Aspeto</div>
                    <div class="theme-toggle" id="theme-toggle">
                        ${['light', 'system', 'dark'].map(t => `<button type="button" class="${theme === t ? 'on' : ''}" data-theme-choice="${t}">${{ light: 'Claro', system: 'Auto', dark: 'Escuro' }[t]}</button>`).join('')}
                    </div>
                </div>
            </div>
        </div>
    </div>`;

    const wrap = root.querySelector('#adm-root');
    wrap.querySelector('#settings-form').addEventListener('submit', saveSettings);
    wrap.querySelector('#account-form')?.addEventListener('submit', createAccount);
    wrap.addEventListener('click', onClick);
    wrap.addEventListener('change', onChange);
}

function credentialsHtml(c) {
    return `<div class="card creds">
        <div class="section-label" style="margin-bottom:8px">${c.reset ? 'Palavra-passe reposta' : c.created ? 'Conta criada' : 'Acesso dado'}</div>
        <p class="small" style="margin:0 0 10px">${c.password
            ? 'Envie esta mensagem à pessoa (WhatsApp, SMS…). A palavra-passe só aparece agora.'
            : `${escapeHtml(c.email)} já tinha conta: entra com a palavra-passe que já usa.`}</p>
        <pre class="creds-msg" id="creds-msg">${escapeHtml(credentialsMessage(c))}</pre>
        <div class="actions" style="justify-content:flex-end"><button type="button" class="btn tiny" id="btn-creds-close">Fechar</button><button type="button" class="btn primary tiny" id="btn-creds-copy">Copiar mensagem</button></div>
    </div>`;
}

export function credentialsMessage(c, url = location.origin + '/planner.html', ward = state.ward?.name || '') {
    const lines = [`Olá, ${c.name}. Já tem acesso à Agenda Sacramental da ${ward}.`, '', `Entre em: ${url}`, `E-mail: ${c.email}`];
    if (c.password) lines.push(`Palavra-passe temporária: ${c.password}`, '', 'Na primeira entrada vai escolher a sua palavra-passe.');
    else lines.push('Use a palavra-passe que já tem.');
    return lines.join('\n');
}

async function createAccount(ev) {
    ev.preventDefault();
    const f = ev.target;
    const btn = f.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
        const name = f.name.value.trim();
        const out = await DM.createAccount({ name, email: f.email.value.trim(), role: f.role.value });
        lastCredentials = { name, email: out.email, password: out.password, created: out.created };
        users = await DM.getWardUsers(); draw();
        showToast(out.created ? 'Conta criada.' : 'Acesso dado.', 'success');
    } catch (e) { showToast(e.message, 'error'); btn.disabled = false; }
}

function initials(s = '') { return s.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(x => x[0].toUpperCase()).join(''); }
function formatAgoTs(ts) {
    if (!ts) return '';
    const days = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
    if (days === 0) return 'hoje'; if (days === 1) return 'ontem'; return `há ${days} dias`;
}

async function saveSettings(ev) {
    ev.preventDefault();
    const f = ev.target;
    try {
        const rotation = f.conducting_rotation.value.split('\n').map(x => x.trim()).filter(Boolean);
        await DM.saveWardSettings({
            presiding: f.presiding.value.trim() || null,
            conducting_rotation: rotation,
            organist: f.organist.value.trim() || null,
            chorister: f.chorister.value.trim() || null,
            default_speakers: Number(f.default_speakers.value) || 3,
            absence_alert_after: Number(f.absence_alert_after.value) || 3,
            hymn_repeat_months: Number(f.hymn_repeat_months.value) || 3,
        });
        const name = f.ward_name.value.trim();
        if (name && name !== state.ward.name) { await DM.updateWard({ name }); state.ward.name = name; document.getElementById('brand-ward').textContent = name; }
        await reloadSettings();
        showToast('Definições guardadas.', 'success');
    } catch (e) { showToast('Erro: ' + e.message, 'error'); }
}

async function onClick(ev) {
    if (ev.target.id === 'btn-creds-copy') {
        try { await navigator.clipboard.writeText(credentialsMessage(lastCredentials)); showToast('Mensagem copiada.', 'success'); } catch { showToast('Não foi possível copiar; selecione o texto.', 'warning'); }
        return;
    }
    if (ev.target.id === 'btn-creds-close') { lastCredentials = null; draw(); return; }
    if (ev.target.id === 'btn-copy') {
        try { await navigator.clipboard.writeText(state.ward.invite_code); showToast('Código copiado.', 'success'); } catch { showToast('Não foi possível copiar.', 'warning'); }
        return;
    }
    if (ev.target.id === 'btn-regen') {
        if (!confirm('Regenerar o código? O antigo deixa de funcionar.')) return;
        try { state.ward.invite_code = await DM.regenerateInviteCode(); draw(); showToast('Novo código gerado.', 'success'); }
        catch (e) { showToast(e.message, 'error'); }
        return;
    }
    // Not [data-theme]: <html> carries that attribute once a theme is chosen, so every click would match.
    const t = ev.target.closest('[data-theme-choice]');
    if (t) { setTheme(t.dataset.themeChoice); draw(); return; }

    const act = ev.target.closest('[data-act]');
    if (!act) return;
    const row = act.closest('[data-uid]');
    const uid = row.dataset.uid;
    if (act.dataset.act === 'reset') {
        const u = users.find(x => x.user_id === uid);
        if (!confirm(`Repor a palavra-passe de ${u?.name || u?.email}? A atual deixa de funcionar.`)) return;
        try {
            const out = await DM.resetAccountPassword(uid);
            lastCredentials = { name: u?.name || out.email, email: out.email, password: out.password, reset: true };
            draw(); window.scrollTo(0, 0);
            showToast('Palavra-passe reposta.', 'success');
        } catch (e) { showToast(e.message, 'error'); }
        return;
    }
    try {
        if (act.dataset.act === 'approve') await DM.approveMember(uid, row.querySelector('[data-role]').value);
        if (act.dataset.act === 'reject' || act.dataset.act === 'remove') {
            if (act.dataset.act === 'remove' && !confirm('Remover o acesso desta pessoa à ala?')) return;
            await DM.removeWardUser(uid);
        }
        users = await DM.getWardUsers(); draw();
        showToast(act.dataset.act === 'approve' ? 'Acesso aprovado.' : 'Removido.', 'success');
    } catch (e) { showToast(e.message, 'error'); }
}

async function onChange(ev) {
    const sel = ev.target.closest('[data-setrole]');
    if (!sel) return;
    const uid = sel.closest('[data-uid]').dataset.uid;
    try { await DM.updateUserRole(uid, sel.value, 'active'); showToast('Papel atualizado.', 'success'); }
    catch (e) { showToast(e.message, 'error'); users = await DM.getWardUsers(); draw(); }
}
