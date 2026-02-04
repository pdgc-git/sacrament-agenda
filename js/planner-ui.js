import { auth } from './firebase-config.js';
import {
    GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
    createUserWithEmailAndPassword, signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import * as DM from './dataManager.js';

// === State ===
const state = {
    user: null,
    members: [], // Cached members
    history: [],
    speakers: [], // Dynamic speaker list
    wardName: 'Ala',
    role: null,
    charts: {} // Store chart instances
};

// === Initialization ===
document.addEventListener('DOMContentLoaded', () => {
    initAuth();
    setupNavigation();
    setupFormListeners();
});

// === Auth Logic ===
function initAuth() {
    const overlay = document.getElementById('auth-overlay');
    // Login Elements
    const googleBtn = document.getElementById('login-btn');
    const emailGroup = document.getElementById('email-auth-group');
    const errorMsg = document.getElementById('auth-error');
    const logoutBtn = document.getElementById('logout-btn');

    // Google Login
    if (googleBtn) {
        googleBtn.addEventListener('click', async () => {
            const provider = new GoogleAuthProvider();
            try {
                await signInWithPopup(auth, provider);
            } catch (error) {
                console.error(error);
                errorMsg.textContent = "Erro no login: " + error.message;
            }
        });
    }

    // Email Login
    if (emailGroup) {
        setupEmailAuthListeners(errorMsg);
    }

    logoutBtn.addEventListener('click', () => {
        signOut(auth);
        window.location.reload();
    });

    onAuthStateChanged(auth, async (user) => {
        state.user = user;
        if (user) {
            try {
                const profile = await DM.initUser(user);

                if (profile.hasWard) {
                    // Check Status
                    if (profile.status === 'pending') {
                        showPendingScreen(overlay);
                        return;
                    }

                    overlay.style.display = 'none';
                    const wardName = await DM.getWardName();
                    document.getElementById('ward-name-display').textContent = wardName;
                    state.wardName = wardName;
                    state.role = profile.role; // Store role

                    // Show Admin Tab if applicable
                    if (state.role === 'admin' || state.role === 'owner') {
                        document.getElementById('nav-admin').style.display = 'flex';
                    }

                    // loadData(); // Old
                    // Render Dashboard by default
                    renderDashboard();
                    document.querySelector('[data-target="view-dashboard"]').classList.add('active');
                    document.getElementById('view-dashboard').classList.add('active');

                    // Pre-fetch basic data
                    loadData(false); // Make loadData optional/background?
                } else {
                    showOnboarding(user, overlay);
                }
            } catch (e) {
                console.error(e);
                errorMsg.textContent = "Erro ao carregar perfil: " + e.message;
            }
        } else {
            overlay.style.display = 'flex';
            resetOnboarding(overlay);
        }
    });
}

function setupEmailAuthListeners(errorMsgDisplay) {
    const btnSignup = document.getElementById('btn-signup-toggle');
    const btnLogin = document.getElementById('btn-email-login');
    const emailInput = document.getElementById('email-input');
    const passInput = document.getElementById('password-input');
    const title = document.getElementById('auth-title');

    let mode = 'login'; // or 'signup'

    if (btnSignup) {
        btnSignup.addEventListener('click', (e) => {
            e.preventDefault();
            mode = mode === 'login' ? 'signup' : 'login';

            if (mode === 'signup') {
                title.textContent = "Criar conta";
                btnLogin.textContent = "Registar";
                btnSignup.textContent = "Já tenho conta";
            } else {
                title.textContent = "Bem-vindo ao Planeador";
                btnLogin.textContent = "Entrar";
                btnSignup.textContent = "Criar conta";
            }
        });
    }

    if (btnLogin) {
        btnLogin.addEventListener('click', async () => {
            const email = emailInput.value;
            const pass = passInput.value;
            if (!email || !pass) return alert("Preencha email e password");

            try {
                if (mode === 'signup') {
                    await createUserWithEmailAndPassword(auth, email, pass);
                } else {
                    await signInWithEmailAndPassword(auth, email, pass);
                }
            } catch (error) {
                console.error(error);
                errorMsgDisplay.textContent = error.message;
            }
        });
    }
}

function showPendingScreen(overlay) {
    const box = overlay.querySelector('.auth-box');
    box.innerHTML = `
        <h2>Pedido Pendente</h2>
        <p style="margin-bottom: 1.5rem; color: #666;">O seu pedido para entrar na ala está a aguardar aprovação do administrador.</p>
        <button id="logout-link" style="background: none; border: none; color: var(--text-light); text-decoration: underline; cursor: pointer;">Sair</button>
    `;
    document.getElementById('logout-link').onclick = () => signOut(auth);
}

function showOnboarding(user, overlay) {
    const box = overlay.querySelector('.auth-box');
    const name = user.displayName || user.email.split('@')[0];

    box.innerHTML = `
        <h2>Bem-vindo, ${name}!</h2>
        <p style="color: #666;">Para continuar, escolha uma opção:</p>
        
        <div style="margin: 1.5rem 0;">
            <h3>Criar Nova Ala</h3>
            <input type="text" id="new-ward-name" placeholder="Nome da Ala (Ex: Lisboa 5)" 
                style="width: 100%; padding: 0.8rem; border: 1px solid var(--border); border-radius: 6px; margin-bottom: 0.5rem;">
            <button id="create-ward-btn" class="btn btn-primary" style="width:100%">Criar</button>
        </div>

        <div style="border-top: 1px solid #eee; padding-top: 1rem;">
            <h3>Ou Juntar-se a uma Ala</h3>
             <input type="text" id="join-ward-id" placeholder="ID da Ala (Peça ao Admin)" 
                style="width: 100%; padding: 0.8rem; border: 1px solid var(--border); border-radius: 6px; margin-bottom: 0.5rem;">
            <button id="join-ward-btn" class="btn btn-secondary" style="width:100%">Pedir Acesso</button>
        </div>
        
        <button id="logout-link" style="background: none; border: none; color: var(--text-light); text-decoration: underline; cursor: pointer; margin-top: 1rem;">Sair</button>
    `;

    document.getElementById('create-ward-btn').addEventListener('click', async () => {
        const name = document.getElementById('new-ward-name').value;
        if (!name) return alert("Insira um nome.");
        try {
            await DM.createWard(name);
            window.location.reload();
        } catch (e) { alert(e.message); }
    });

    document.getElementById('join-ward-btn').addEventListener('click', async () => {
        const id = document.getElementById('join-ward-id').value.trim();
        if (!id) return alert("Insira o ID da Ala.");
        try {
            await DM.joinWard(id);
            showPendingScreen(overlay);
        } catch (e) { alert(e.message); }
    });

    document.getElementById('logout-link').onclick = () => signOut(auth);
}

function resetOnboarding(overlay) {
    const box = overlay.querySelector('.auth-box');
    // Restore original login HTML is tricky if we want to restore complex form.
    // Instead we basically reload the page or re-render the static HTML
    // Ideally we put the STATIC HTML in index.html and show/hide it.
    // But since we are replacing content, let's write the restore function to match the HTML we are about to write.

    box.innerHTML = `
        <div style="margin-bottom: 2rem;">
            <h2 id="auth-title" style="font-family: var(--font-body); font-weight: 700; font-size: 2rem; color: var(--primary); margin-bottom: 0.5rem;">Bem-vindo</h2>
            <p style="color: var(--text-light); font-size: 0.95rem;">Planeador da Agenda Sacramental</p>
        </div>
        
        <button id="login-btn" class="btn premium-btn" style="width:100%; margin-bottom: 1.5rem; justify-content: center;">
            <i class="ph ph-google-logo" style="font-size: 1.2rem;"></i> <span style="font-weight:600; margin-left:8px;">Continuar com Google</span>
        </button>

        <div style="display: flex; align-items: center; margin: 1.5rem 0; color: #cbd5e1;">
            <div style="flex:1; height:1px; background:#e2e8f0;"></div>
            <span style="padding: 0 12px; font-size: 0.75rem; font-weight:600; letter-spacing:1px; color:#94a3b8;">EMAIL</span>
            <div style="flex:1; height:1px; background:#e2e8f0;"></div>
        </div>

        <div id="email-auth-group" style="text-align: left;">
            <div class="input-wrapper">
                <input type="email" id="email-input" class="premium-input" placeholder="seu.email@exemplo.com" style="width:100%; padding: 0.9rem; border-radius: 8px;">
            </div>
            <div class="input-wrapper">
                <input type="password" id="password-input" class="premium-input" placeholder="Palavra-passe" style="width:100%; padding: 0.9rem; border-radius: 8px;">
            </div>
            <button id="btn-email-login" class="btn btn-primary" style="width:100%; padding:0.9rem; background: var(--primary-dark);">Entrar com Email</button>
            
            <div style="text-align:center; margin-top: 1.5rem;">
                <a href="#" id="btn-signup-toggle" style="font-size: 0.85rem; color: var(--primary); font-weight:500; text-decoration:none; border-bottom:1px dashed var(--primary);">Criar nova conta</a>
            </div>
        </div>

        <p id="auth-error" style="color: #ef4444; margin-top: 1.5rem; font-size: 0.85rem; min-height: 1.2rem;"></p>
    `;

    // Re-bind
    // REMOVED initAuth() to prevent infinite recursion loop
    // initAuth(); 

    // Wait, initAuth adds listeners to existing elements. 
    // If we call initAuth again, it checks if elements exist.
    // But initAuth also sets up onAuthStateChanged which we don't want to duplicate.
    // We should separate listener binding.
    // Actually, simple way: Just adapt initAuth to be cleaner or extract binding.

    // For now, let's just manually bind here to avoid re-triggering auth state listener
    const googleBtn = document.getElementById('login-btn');
    if (googleBtn) {
        googleBtn.addEventListener('click', async () => {
            const provider = new GoogleAuthProvider();
            try { await signInWithPopup(auth, provider); }
            catch (error) { document.getElementById('auth-error').textContent = error.message; }
        });
    }
    setupEmailAuthListeners(document.getElementById('auth-error'));
}

// === Navigation ===
function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item[data-target]');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');

            const targetId = item.getAttribute('data-target');
            document.querySelectorAll('.view-container').forEach(v => v.classList.remove('active'));
            document.getElementById(targetId).classList.add('active');

            if (targetId === 'view-roster') renderRoster();
            if (targetId === 'view-history') renderHistoryTab();
            if (targetId === 'view-admin') renderAdminTab();
            if (targetId === 'view-dashboard') renderDashboard();
        });
    });
}

// === Dashboard Logic ===
async function renderDashboard() {
    const greeting = document.getElementById('dashboard-greeting');
    const subtitle = document.getElementById('dashboard-subtitle');
    const mtdEl = document.getElementById('stat-mtd');
    const ytdEl = document.getElementById('stat-ytd');

    // Labels
    const lblMonth = document.getElementById('lbl-month');
    const lblYear = document.getElementById('lbl-year');

    if (state.user) {
        greeting.textContent = `Olá, ${state.user.displayName || state.user.email.split('@')[0]}`;

        // Update subtitle with Ward Name if available
        if (state.wardName) {
            subtitle.textContent = `Bem vindo à ${state.wardName}`;
        }
    }

    try {
        const stats = await DM.getDashboardStats();
        mtdEl.textContent = stats.mtd;
        ytdEl.textContent = stats.ytd;

        // Capitalize month
        const monthName = stats.monthName.charAt(0).toUpperCase() + stats.monthName.slice(1);
        lblMonth.textContent = monthName;
        lblYear.textContent = stats.year;

    } catch (e) {
        console.error("Dashboard error:", e);
    }
}

async function loadData() {
    try {
        state.members = await DM.getMembers();
    } catch (e) { console.error("Error loading data", e); }
}

// === Admin Logic ===
async function renderAdminTab() {
    const tbody = document.getElementById('admin-users-tbody');
    tbody.innerHTML = 'Carregando...';
    try {
        const users = await DM.getWardUsers();
        tbody.innerHTML = '';

        users.sort((a, b) => (a.status === 'pending' ? -1 : 1)); // Pending first

        users.forEach(u => {
            const tr = document.createElement('tr');
            const isMe = u.uid === state.user.uid;

            let actionBtn = '';
            if (!isMe) {
                if (u.status === 'pending') {
                    actionBtn = `<button class="btn-approve" data-uid="${u.uid}" style="background:#22c55e; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">Aprovar</button>`;
                } else {
                    actionBtn = `<select class="role-select" data-uid="${u.uid}">
                        <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
                        <option value="editor" ${u.role === 'editor' ? 'selected' : ''}>Editor</option>
                        <option value="music" ${u.role === 'music' ? 'selected' : ''}>Música</option>
                        <option value="viewer" ${u.role === 'viewer' ? 'selected' : ''}>Visualizador</option>
                     </select>`;
                }
            }

            tr.innerHTML = `
                <td>${u.name} ${isMe ? '(Eu)' : ''}</td>
                <td>${u.email}</td>
                <td>${u.role}</td>
                <td><span class="status-badge ${u.status}">${u.status}</span></td>
                <td>${actionBtn}</td>
            `;
            tbody.appendChild(tr);
        });

        // Bind Actions
        tbody.querySelectorAll('.btn-approve').forEach(btn => {
            btn.addEventListener('click', async () => {
                await DM.updateUserRole(btn.dataset.uid, 'editor', 'active');
                renderAdminTab();
            });
        });

        tbody.querySelectorAll('.role-select').forEach(sel => {
            sel.addEventListener('change', async (e) => {
                await DM.updateUserRole(e.target.dataset.uid, e.target.value, 'active');
                showToast("Função atualizada");
            });
        });

    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="5">Erro: ${e.message}</td></tr>`;
    }
}

// === Planner Form Logic ===

function setupFormListeners() {
    // 1. Generic Input Sync (Date, Presiding, etc.)
    const form = document.getElementById('agendaForm');
    const simpleInputs = form.querySelectorAll('input:not(.member-search):not(.hymn-search), select');
    simpleInputs.forEach(input => {
        input.addEventListener('input', (e) => updatePreview(e.target.name, e.target.value));
    });

    // 2. Member Search (Invocation, Benediction, Speakers)
    setupMemberSearch(document.querySelector('input[name="invocation"]'));
    setupMemberSearch(document.querySelector('input[name="benediction"]'));

    // 3. Hymn Search (With History Warning)
    document.querySelectorAll('.hymn-search').forEach(setupHymnSearch);

    // 4. Finalize Button
    document.getElementById('btn-finalize').addEventListener('click', handleFinalize);

    // Global functions for inline HTML calls
    window.addSpeakerUI = addSpeakerUI;
    window.addProgramHymnUI = addProgramHymnUI;
    window.removeSpeakerUI = removeSpeakerUI;
    window.addMemberUI = showMemberModal; // Mapped to new modal
}

function updatePreview(key, value) {
    if (!key) return;
    const targets = document.querySelectorAll(`[data-bind="${key}"]`);
    targets.forEach(el => {
        if (key === 'date' && value) {
            const dateObj = new Date(value);
            const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
            el.textContent = dateObj.toLocaleDateString('pt-PT', options);
        } else {
            el.textContent = value || '...';
        }
    });
}

// --- Smart Member Search ---
function setupMemberSearch(input, onSelect) {
    if (!input) return;
    const wrapper = input.parentElement; // .member-search-wrapper or wrapper
    let resultsBox = wrapper.querySelector('.member-results');

    // Create results box if missing (dynamic speakers)
    if (!resultsBox) {
        resultsBox = document.createElement('div');
        resultsBox.className = 'member-results hymn-results'; // Reuse hymn-results styling
        wrapper.appendChild(resultsBox);
        wrapper.style.position = 'relative';
    }

    input.addEventListener('input', () => {
        const q = input.value.toLowerCase();
        if (q.length < 2) {
            resultsBox.style.display = 'none';
            return;
        }

        const matches = state.members.filter(m => m.name.toLowerCase().includes(q));
        renderMemberResults(matches, resultsBox, input, onSelect);
    });

    // Close on click outside
    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) resultsBox.style.display = 'none';
    });
}

function renderMemberResults(members, container, input, onSelect) {
    container.innerHTML = '';
    if (members.length === 0) {
        container.style.display = 'none';
        return;
    }

    members.slice(0, 8).forEach(m => {
        const div = document.createElement('div');
        div.className = 'hymn-result-item'; // Reuse style

        // Smart Check: Last Spoke
        let lastSpokeText = '';
        let warning = '';
        if (m.last_talk_date) {
            const date = m.last_talk_date.toDate();
            lastSpokeText = ` (Último: ${date.toLocaleDateString()})`;

            // Warning if < 6 months
            const sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
            if (date > sixMonthsAgo) {
                warning = `<span class="smart-badge badge-warning">! Recente</span>`;
            }
        }

        div.innerHTML = `${m.name} <span style="font-size:0.8em; color:#666">${lastSpokeText}</span> ${warning}`;

        div.onclick = () => {
            input.value = m.name;
            input.dataset.memberId = m.id; // Store ID for finalization
            container.style.display = 'none';
            updatePreview(input.name, m.name);
            if (onSelect) onSelect(m);
        };
        container.appendChild(div);
    });
    container.style.display = 'block';
}

// --- Smart Hymn Search ---
function setupHymnSearch(input) {
    // Basic search logic reusing existing window.hymns if available
    // Plus "Smart Warning"
    const wrapper = input.parentElement;
    const resultsBox = wrapper.querySelector('.hymn-results');

    input.addEventListener('input', () => {
        const val = input.value;
        if (window.hymns) {
            const matches = window.hymns.filter(h =>
                h.number.toString().startsWith(val) || h.title.toLowerCase().includes(val.toLowerCase())
            ).slice(0, 5);

            resultsBox.innerHTML = '';
            if (matches.length > 0 && val.length > 0) {
                matches.forEach(h => {
                    const div = document.createElement('div');
                    div.className = 'hymn-result-item';
                    div.textContent = `${h.number} - ${h.title}`;
                    div.onclick = async () => {
                        const str = `${h.number} - ${h.title}`;
                        input.value = str;
                        resultsBox.style.display = 'none';
                        updatePreview(input.name, str);

                        // SMART CHECK
                        const recent = await DM.checkHymnHistory(h.number.toString());
                        if (recent) {
                            showToast(`⚠️ Este hino foi cantado em ${recent.date.toLocaleDateString()}`);
                            input.style.borderColor = "#ef4444";
                        } else {
                            input.style.borderColor = "#e5e7eb";
                        }
                    };
                    resultsBox.appendChild(div);
                });
                resultsBox.style.display = 'block';
            } else {
                resultsBox.style.display = 'none';
            }
        }

        // Also direct update
        updatePreview(input.name, val);
    });

    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) resultsBox.style.display = 'none';
    });
}

// --- Dynamic Speakers ---
function addSpeakerUI() {
    const id = Date.now().toString();
    state.speakers.push({ id, type: 'speaker', memberId: null, name: '' });
    renderSpeakersInput();
}

function addProgramHymnUI() {
    const id = Date.now().toString();
    state.speakers.push({ id, type: 'hymn', name: '' });
    renderSpeakersInput();
}

function removeSpeakerUI(id) {
    state.speakers = state.speakers.filter(s => s.id !== id);
    renderSpeakersInput();
    renderSpeakersOutput();
}

function renderSpeakersInput() {
    const container = document.getElementById('speakers-input-container');
    container.innerHTML = '';

    state.speakers.forEach(item => {
        const row = document.createElement('div');
        row.className = 'input-row';
        row.style.marginBottom = '0.5rem';

        if (item.type === 'speaker') {
            row.innerHTML = `
                <div class="member-search-wrapper" style="flex:1;">
                    <input type="text" class="member-search" placeholder="Orador..." value="${item.name}">
                    <div class="member-results"></div>
                </div>
                <button class="btn-remove" onclick="removeSpeakerUI('${item.id}')">×</button>
            `;
            const input = row.querySelector('input');
            setupMemberSearch(input, (member) => {
                item.memberId = member.id;
                item.name = member.name;
                renderSpeakersOutput();
            });
            input.addEventListener('input', (e) => {
                item.name = e.target.value;
                item.memberId = null; // Reset ID if manually typed
                renderSpeakersOutput();
            });
        } else {
            // Hymn
            row.innerHTML = `
                <div class="hymn-input-wrapper" style="flex:1; margin-bottom:0;">
                    <input type="text" class="hymn-search" placeholder="Hino Intermediário..." value="${item.name}">
                    <div class="hymn-results"></div>
                </div>
                <button class="btn-remove" onclick="removeSpeakerUI('${item.id}')">×</button>
            `;
            const input = row.querySelector('input');
            setupHymnSearch(input);
            // We need to manually capture selection from setupHymnSearch OR just bind input
            input.addEventListener('input', (e) => {
                item.name = e.target.value;
                renderSpeakersOutput();
            });
        }

        container.appendChild(row);
    });
}

function renderSpeakersOutput() {
    const container = document.getElementById('speakers-list');
    container.innerHTML = '';

    state.speakers.forEach(item => {
        if (!item.name) return;

        if (item.type === 'hymn') {
            const div = document.createElement('div');
            div.className = 'program-item highlight-box';
            div.innerHTML = `<span class="program-label">Hino Interm.</span><span class="program-value hymn">${item.name}</span>`;
            container.appendChild(div);
        } else {
            const div = document.createElement('div');
            div.className = 'program-item';
            div.innerHTML = `<span class="program-label">Orador</span><span class="program-value">${item.name}</span>`;
            container.appendChild(div);
        }
    });
}

// === Roster Logic ===
function renderRoster() {
    const tbody = document.getElementById('roster-tbody');
    tbody.innerHTML = '';

    const filter = document.getElementById('roster-filter').value;
    let list = state.members;

    if (filter.startsWith('gender_')) {
        const g = filter.split('_')[1];
        list = list.filter(m => m.gender === g);
    } else if (filter !== 'all') {
        list = list.filter(m => m.group === filter);
    }

    list.slice(0, 50).forEach(m => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div style="font-weight:600; cursor:pointer;" class="view-link" data-id="${m.id}">${m.name}</div>
                <div style="font-size:0.8em; color:#666">${m.calling || ''}</div>
            </td>
            <td>${m.group}</td>
            <td>${m.last_talk_date ? m.last_talk_date.toDate().toLocaleDateString() : '-'}</td>
            <td>${m.last_prayer_date ? m.last_prayer_date.toDate().toLocaleDateString() : '-'}</td>
            <td class="action-cell">
                <button class="btn-meatballs" onclick="toggleMenu(event, '${m.id}')">⋮</button>
                <div id="menu-${m.id}" class="action-menu" style="display:none;">
                    <div class="menu-item" onclick="viewMember('${m.id}')">
                        <span>👁️</span> Ver
                    </div>
                    <div class="menu-item" onclick="editMember('${m.id}')">
                        <span>✏️</span> Editar
                    </div>
                    <div class="menu-item danger" onclick="deleteMember('${m.id}')">
                         <span>🗑️</span> Apagar
                    </div>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Bind click on name to view also
    tbody.querySelectorAll('.view-link').forEach(el => {
        el.addEventListener('click', () => viewMember(el.dataset.id));
    });
}

// === Window-scoped functions for inline onclick handlers ===
window.toggleMenu = function (e, id) {
    e.stopPropagation();
    // Close all other menus
    document.querySelectorAll('.action-menu').forEach(el => {
        if (el.id !== `menu-${id}`) el.style.display = 'none';
    });
    // Toggle this menu
    const menu = document.getElementById(`menu-${id}`);
    menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
};

window.editMember = function (id) {
    const member = state.members.find(m => m.id === id);
    if (member) showMemberModal(member);
};

let pendingDeleteId = null;

window.deleteMember = function (id) {
    pendingDeleteId = id;
    const modal = document.getElementById('delete-confirm-modal');
    if (modal) modal.style.display = 'flex';
};

window.viewMember = async function (id) {
    const member = state.members.find(m => m.id === id);
    if (!member) return;

    // Populate Modal
    document.getElementById('view-mem-name').textContent = member.name;
    document.getElementById('view-mem-details').textContent = `${member.calling || 'Sem chamado'} • ${member.group} • ${member.gender === 'M' ? 'Masculino' : 'Feminino'}`;

    // Setup Edit Button
    const btnEdit = document.getElementById('btn-edit-from-view');
    btnEdit.onclick = () => {
        document.getElementById('member-view-modal').style.display = 'none';
        showMemberModal(member);
    };

    // Load History
    const listTalks = document.getElementById('view-mem-talks');
    const listPrayers = document.getElementById('view-mem-prayers');
    listTalks.innerHTML = '<li>Carregando...</li>';
    listPrayers.innerHTML = '<li>Carregando...</li>';

    document.getElementById('member-view-modal').style.display = 'flex';

    try {
        const history = await DM.getMemberHistory(member.id);

        listTalks.innerHTML = '';
        if (history.talks.length === 0) listTalks.innerHTML = '<li style="color:#aaa">Sem registos recentes</li>';
        history.talks.forEach(t => {
            listTalks.innerHTML += `<li>${t.date.toLocaleDateString()} - ${t.topic}</li>`;
        });

        listPrayers.innerHTML = '';
        if (history.prayers.length === 0) listPrayers.innerHTML = '<li style="color:#aaa">Sem registos recentes</li>';
        history.prayers.forEach(p => {
            listPrayers.innerHTML += `<li>${p.date.toLocaleDateString()} - ${p.type}</li>`;
        });

    } catch (e) {
        listTalks.innerHTML = `<li>Erro: ${e.message}</li>`;
    }
}

// === Modal Event Bindings (run after DOM loads) ===
// Bind Delete Modal Buttons
document.addEventListener('DOMContentLoaded', () => {
    const cancelBtn = document.getElementById('btn-cancel-delete');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            document.getElementById('delete-confirm-modal').style.display = 'none';
            pendingDeleteId = null;
        });
    }

    const confirmBtn = document.getElementById('btn-confirm-delete');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
            if (!pendingDeleteId) return;
            try {
                await DM.deleteMember(pendingDeleteId);
                showToast("Membro removido.");
                document.getElementById('delete-confirm-modal').style.display = 'none';
                pendingDeleteId = null;
                await loadData();
                renderRoster();
            } catch (e) {
                showToast("Erro: " + e.message);
            }
        });
    }

    // Close all menus on global click
    document.addEventListener('click', () => {
        document.querySelectorAll('.action-menu').forEach(el => el.style.display = 'none');
    });
});

// Placeholder functions - Replaced by showMemberModal
// function addMemberUI() { ... }

const memberModal = document.getElementById('member-modal');
if (memberModal) {
    document.getElementById('btn-cancel-member').addEventListener('click', () => {
        memberModal.style.display = 'none';
    });

    document.getElementById('btn-save-member').addEventListener('click', async () => {
        const name = document.getElementById('mem-name').value;
        const calling = document.getElementById('mem-calling').value;
        const group = document.getElementById('mem-group').value;
        const gender = document.querySelector('input[name="mem-gender"]:checked').value;
        const id = document.getElementById('btn-save-member').dataset.id || null;

        if (!name) return alert("Nome é obrigatório");

        try {
            await DM.saveMember({ id, name, calling, group, gender });
            memberModal.style.display = 'none';
            showToast("Membro guardado!");

            // FORCE REFRESH
            await loadData();
            renderRoster(); // Explicitly re-render roster
        } catch (e) {
            alert("Erro ao guardar: " + e.message);
        }
    });
}


function showMemberModal(member = null) {
    const modal = document.getElementById('member-modal');
    const title = document.getElementById('modal-title');
    const btnSave = document.getElementById('btn-save-member');

    // Reset or Fill
    if (member) {
        title.textContent = "Editar Membro";
        document.getElementById('mem-name').value = member.name;
        document.getElementById('mem-calling').value = member.calling || '';
        document.getElementById('mem-group').value = member.group || 'Adult';

        const gender = member.gender || 'M';
        document.querySelector(`input[name="mem-gender"][value="${gender}"]`).checked = true;

        btnSave.dataset.id = member.id;
    } else {
        title.textContent = "Novo Membro";
        document.getElementById('mem-name').value = '';
        document.getElementById('mem-calling').value = '';
        document.getElementById('mem-group').value = 'Adult';
        document.querySelector('input[name="mem-gender"][value="M"]').checked = true;
        btnSave.dataset.id = '';
    }

    modal.style.display = 'flex';
}

// Make globally accessible immediately
window.addMemberUI = showMemberModal;

document.getElementById('csv-upload').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        const count = await DM.importMembersFromCSV(file);
        showToast(`${count} membros importados!`);
        await loadData();
        renderRoster();
    }
});

// === History & Finalization ===
async function handleFinalize() {
    if (!confirm("Tem a certeza? Isto irá guardar o histórico e atualizar as datas dos oradores.")) return;

    const form = document.getElementById('agendaForm');
    const formData = new FormData(form);

    const meetingData = {
        date: formData.get('date'),
        presiding: formData.get('presiding'),
        conducting: formData.get('conducting'),
        hymns: [
            formData.get('openingHymn'),
            formData.get('sacramentHymn'),
            formData.get('closingHymn'),
            ...state.speakers.filter(s => s.type === 'hymn').map(s => s.name)
        ].filter(Boolean),
        speakers: state.speakers.filter(s => s.type === 'speaker'),
        // Invocation/Benediction IDs? We need to store them in dataset or state
        invocationMemberId: document.querySelector('input[name="invocation"]').dataset.memberId,
        benedictionMemberId: document.querySelector('input[name="benediction"]').dataset.memberId,
        attendance: {
            start: formData.get('att_start'),
            sacrament: formData.get('att_sacrament'),
            end: formData.get('att_end'),
            visitors: formData.get('att_visitors')
        }
    };

    try {
        await DM.saveMeeting(meetingData);
        showToast("Reunião finalizada com sucesso!");
        // Refresh data to show updated dates
        loadData();
    } catch (e) {
        console.error(e);
        showToast("Erro ao finalizar: " + e.message);
    }
}

async function renderHistoryTab() {
    const tbody = document.getElementById('history-tbody');
    tbody.innerHTML = 'Carregando...';
    try {
        const history = await DM.getHistory();
        tbody.innerHTML = '';

        history.forEach(h => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${h.date.toLocaleDateString()}</td>
                <td>${h.presiding} / ${h.conducting}</td>
                <td>${h.hymns.length} hinos</td>
                <td>${h.attendance?.sacrament || '-'}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="4">Erro ao carregar histórico: ${e.message}</td></tr>`;
    }
}

function showToast(msg) {
    const div = document.createElement('div');
    div.className = 'toast';
    div.textContent = msg;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 3000);
}

// === Export PDF ===
window.exportPDF = async function () {
    const element = document.getElementById('agenda-paper');

    // Get date for filename
    const dateInput = document.querySelector('input[name="date"]');
    const dateValue = dateInput ? dateInput.value : '';
    const filename = dateValue ? `agenda_sacramental_${dateValue}.pdf` : 'agenda_sacramental.pdf';

    // Config for html2pdf
    const opt = {
        margin: 0,
        filename: filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
    };

    // If on mobile/share-capable device, try to share the blob directly
    if (navigator.canShare && navigator.share) {
        try {
            const worker = html2pdf().set(opt).from(element);
            const blob = await worker.output('blob');
            const file = new File([blob], filename, { type: 'application/pdf' });

            if (navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: 'Agenda Sacramental',
                    text: `Agenda para ${dateValue}`,
                });
                return; // Shared!
            }
        } catch (err) {
            console.log('Share failed or cancelled, falling back to download', err);
        }
    }

    // Fallback or Desktop: Direct Download
    html2pdf(element, opt);
};

// === Future Planning Logic ===

async function renderPlanningTab() {
    const container = document.getElementById('view-planning');
    // Clear placeholder
    container.innerHTML = `
        <header class="roster-header">
            <h1>Planeamento Futuro</h1>
            <button class="btn btn-primary" id="btn-add-plan"><i class="ph ph-plus"></i> Novo Plano</button>
        </header>
        <div class="roster-grid">
            <table id="planning-table">
                <thead>
                    <tr>
                        <th>Data</th>
                        <th>Tópico</th>
                        <th>Oradores (Esboço)</th>
                        <th>Ações</th>
                    </tr>
                </thead>
                <tbody id="planning-tbody"></tbody>
            </table>
        </div>
    `;

    document.getElementById('btn-add-plan').addEventListener('click', () => editPlanUI());

    const tbody = document.getElementById('planning-tbody');
    tbody.innerHTML = '<tr><td colspan="4">Carregando...</td></tr>';

    try {
        const plans = await DM.getFuturePlans();
        tbody.innerHTML = '';

        // Generate next 4 Sundays if empty? 
        // For now just show lists

        plans.forEach(p => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${p.dateStr}</td>
                <td>${p.topic || '-'}</td>
                <td>${(p.speakers || []).join(', ')}</td>
                <td><button class="btn-edit-plan" data-id="${p.id}">Editar</button></td>
            `;
            tbody.appendChild(tr);
        });

        tbody.querySelectorAll('.btn-edit-plan').forEach(btn => {
            btn.addEventListener('click', () => {
                const plan = plans.find(p => p.id === btn.dataset.id);
                editPlanUI(plan);
            });
        });

    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="4">Erro: ${e.message}</td></tr>`;
    }
}

function editPlanUI(plan = null) {
    const dateStr = plan ? plan.dateStr : new Date().toISOString().split('T')[0];
    const topic = plan ? plan.topic : '';
    const speakersStr = plan ? (plan.speakers || []).join(', ') : '';

    // Simple Prompt UI for MVP
    // In a real app we'd use a modal
    const newDate = prompt("Data (YYYY-MM-DD):", dateStr);
    if (!newDate) return;

    const newTopic = prompt("Tópico:", topic);
    const newSpeakers = prompt("Oradores (separados por vírgula):", speakersStr);

    const data = {
        id: plan ? plan.id : null,
        dateStr: newDate,
        topic: newTopic,
        speakers: newSpeakers.split(',').map(s => s.trim()).filter(Boolean)
    };

    DM.saveFuturePlan(data).then(() => {
        showToast("Plano guardado!");
        renderPlanningTab();
    }).catch(e => alert(e.message));
}


// === Role Based Restrictions ===

function applyRoleRestrictions() {
    const role = state.role;
    const form = document.getElementById('agendaForm');

    // Reset all disabled
    form.querySelectorAll('input, button').forEach(el => el.disabled = false);

    if (role === 'viewer') {
        form.querySelectorAll('input, button').forEach(el => el.disabled = true);
        document.getElementById('btn-finalize').style.display = 'none';
    } else if (role === 'music') {
        // Disable everything
        form.querySelectorAll('input, button').forEach(el => el.disabled = true);

        // Enable Music Fields
        const musicFields = [
            'organist', 'chorister',
            'openingHymn', 'sacramentHymn', 'closingHymn'
        ];

        musicFields.forEach(name => {
            const inp = form.querySelector(`[name="${name}"]`);
            if (inp) {
                inp.disabled = false;
                // Enable parent containers' search results if needed
            }
        });

        // Also enable ProgramHymn buttons?
        // It's tricky with the current UI mixed structure.
        // For MVP, limit core "static" fields. 

        // Hide Finalize, maybe show "Save" button for music only?
        // Since finalizing is a big action updating Last Spoken dates (not relevant to music user usually), key is disabling it.
        document.getElementById('btn-finalize').style.display = 'none';
    }
}

// Hook into navigation to apply restrictions when entering Planner
// We'll just call applyRoleRestrictions inside loadData or navigation click
document.querySelector('.nav-item[data-target="view-planner"]').addEventListener('click', () => {
    applyRoleRestrictions();
});
