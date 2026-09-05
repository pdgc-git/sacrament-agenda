// Administração: ward settings (what prefills Domingo), pending approvals, invite code, roles, theme.
import * as DM from '../dataManager.js';
import { state, canAdmin, reloadSettings } from '../app-state.js';
import { escapeHtml } from '../utils/security.js';
import { showToast } from '../components/Toast.js';
import { setTheme } from '../utils/theme.js';

const ROLE_LABELS = { owner: 'Proprietário', admin: 'Bispado', editor: 'Editor', music: 'Música', viewer: 'Leitor' };
let root = null;
let users = [];

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
                <div class="card">
                    <div class="section-label" style="margin-bottom:10px">Código de convite</div>
                    <div class="invite-code"><span class="code" id="invite-code">${escapeHtml(state.ward?.invite_code || '')}</span>
                        <span class="actions"><button type="button" class="btn tiny" id="btn-copy">Copiar</button><button type="button" class="btn tiny" id="btn-regen">Regenerar</button></span></div>
                    <p class="small muted" style="margin-top:8px">Sem registo público: a conta é criada pelo bispado, a pessoa entra e junta-se com este código. Regenerar invalida o código antigo.</p>
                </div>
                <div class="card">
                    <div class="section-label" style="margin-bottom:6px">Acessos</div>
                    ${active.map(u => `<div class="row-kv" data-uid="${u.user_id}">
                        <span class="v" style="font-weight:400">${escapeHtml(u.name || u.email || u.user_id)}</span>
                        ${u.role === 'owner' || !canAdmin()
                            ? `<span class="badge ${u.role === 'owner' ? 'owner' : ''}">${ROLE_LABELS[u.role]}</span>`
                            : `<select class="input" style="width:auto; padding:4px 8px" data-setrole>${['admin', 'editor', 'music', 'viewer'].map(r => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${ROLE_LABELS[r]}</option>`).join('')}</select>
                               <button type="button" class="x" data-act="remove" title="Remover acesso">✕</button>`}
                    </div>`).join('')}
                </div>
                <div class="card">
                    <div class="section-label" style="margin-bottom:10px">Aspeto</div>
                    <div class="theme-toggle" id="theme-toggle">
                        ${['light', 'system', 'dark'].map(t => `<button type="button" class="${theme === t ? 'on' : ''}" data-theme="${t}">${{ light: 'Claro', system: 'Auto', dark: 'Escuro' }[t]}</button>`).join('')}
                    </div>
                </div>
            </div>
        </div>
    </div>`;

    const wrap = root.querySelector('#adm-root');
    wrap.querySelector('#settings-form').addEventListener('submit', saveSettings);
    wrap.addEventListener('click', onClick);
    wrap.addEventListener('change', onChange);
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
    const t = ev.target.closest('[data-theme]');
    if (t) { setTheme(t.dataset.theme); draw(); return; }

    const act = ev.target.closest('[data-act]');
    if (!act) return;
    const row = act.closest('[data-uid]');
    const uid = row.dataset.uid;
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
