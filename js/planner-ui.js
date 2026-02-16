import { escapeHtml } from './utils/security.js';
import { auth, db } from './firebase-config.js';
import {
    GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
    createUserWithEmailAndPassword, signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import * as DM from './dataManager.js';
import { extractVisualLines, parseMemberLines, normalizeName, parseCallingUpdates } from './utils/pdfParser.js';

import { setupHymnSearch } from './utils/uiUtils.js';
import { showToast } from './components/Toast.js';

// === State ===
const state = {
    user: null,
    members: [], // Cached members
    history: [],
    futurePlans: [], // Cache for timeline
    speakers: [], // Dynamic speaker list for Editor
    recognitions: [],
    announcements: [],
    releases: [],
    callings: [],
    wardName: 'Ala',
    role: null,
    currentEditorDate: null, // YYYY-MM-DD being edited
    activeMemberInput: null, // Track which input is focused for "Click to Insert"
    viewMode: 'PLAN', // 'PLAN' or 'FULL'
    activeSubTab: 'speakers', // 'speakers', 'hymns', 'prayers'
    assistantFilterGender: null,
    assistantFilterGroup: null
};

// Expose state for debugging


// === Initialization ===
document.addEventListener('DOMContentLoaded', () => {
    initAuth();
    setupNavigation();
    setupFormListeners();
    setupEventListeners();
});

function setupEventListeners() {
    // Dashboard
    const btnHeroEdit = document.getElementById('btn-hero-edit-plan');
    if (btnHeroEdit) btnHeroEdit.addEventListener('click', () => {
        const dateStr = state.currentEditorDate || new Date().toISOString().split('T')[0]; // Fallback if not set via render
        window.editPlan(dateStr); // Keeping window.editPlan for now as it's used elsewhere, will refactor later if possible
    });

    // Timeline
    document.getElementById('btn-refresh-timeline')?.addEventListener('click', () => renderTimeline());

    // Mode Toggle (Plan / Full)
    document.querySelectorAll('.mode-toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.mode;
            if (mode) setPlannerMode(mode);
        });
    });

    // Plan Sub-Navigation
    document.querySelectorAll('.plan-subnav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.subtab;
            if (tab) renderPlanSubTab(tab);
        });
    });

    // Assistant Panel Filters
    document.getElementById('assist-filter-m')?.addEventListener('click', () => toggleAssistantFilter('M'));
    document.getElementById('assist-filter-f')?.addEventListener('click', () => toggleAssistantFilter('F'));
    document.getElementById('assist-filter-youth')?.addEventListener('click', () => toggleAssistantFilter('Youth'));

    // Editor Actions
    document.getElementById('btn-export-pdf')?.addEventListener('click', exportPDF);
    document.getElementById('btn-add-speaker')?.addEventListener('click', () => addSpeakerUI());
    document.getElementById('btn-add-hymn-program')?.addEventListener('click', () => addProgramHymnUI());

    // Extras
    document.getElementById('btn-add-recognition')?.addEventListener('click', () => addListItem('recognitions'));
    document.getElementById('btn-add-announcement')?.addEventListener('click', () => addListItem('announcements'));
    document.getElementById('btn-add-release')?.addEventListener('click', () => addListItem('releases'));
    document.getElementById('btn-add-calling')?.addEventListener('click', () => addListItem('callings'));

    // Fast Meeting
    document.getElementById('chk-fast-meeting')?.addEventListener('change', (e) => toggleFastMeeting(e.target.checked));

    // Roster
    document.getElementById('filter-chip-m')?.addEventListener('click', () => togglePoolFilter('M'));
    document.getElementById('filter-chip-f')?.addEventListener('click', () => togglePoolFilter('F'));
    document.getElementById('filter-chip-youth')?.addEventListener('click', () => togglePoolFilter('Youth'));

    document.getElementById('btn-open-import')?.addEventListener('click', () => openBulkImport());
    document.getElementById('btn-new-member')?.addEventListener('click', () => addMemberUI());

    // Modals
    document.getElementById('btn-close-view-modal')?.addEventListener('click', () => document.getElementById('member-view-modal').style.display = 'none');
    document.getElementById('btn-close-import-modal')?.addEventListener('click', () => document.getElementById('bulk-import-modal').style.display = 'none');

    // Import Modal Actions
    document.getElementById('btn-download-template')?.addEventListener('click', () => downloadTemplate());
    document.getElementById('btn-process-paste')?.addEventListener('click', () => processPasteImport());
    document.getElementById('btn-select-file')?.addEventListener('click', () => document.getElementById('bulk-csv-upload').click());

    // Roster Event Delegation
    document.getElementById('roster-tbody')?.addEventListener('click', (e) => {
        const target = e.target.closest('[data-action], .view-link');
        if (!target) return;

        // Handle View Link
        if (target.classList.contains('view-link')) {
            viewMember(target.dataset.id);
            return;
        }

        const action = target.dataset.action;
        const id = target.dataset.id;

        if (action === 'toggle-menu') {
            e.stopPropagation();
            toggleMenu(id);
        } else if (action === 'view') {
            viewMember(id);
        } else if (action === 'edit') {
            editMember(id);
        } else if (action === 'delete') {
            deleteMember(id);
        }
    });

    // Close menus on click outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.action-menu') && !e.target.closest('.btn-meatballs')) {
            document.querySelectorAll('.action-menu').forEach(el => el.style.display = 'none');
        }
    });

    // Close Modals on ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const modals = ['member-modal', 'member-view-modal', 'delete-confirm-modal', 'bulk-import-modal', 'auth-overlay'];
            modals.forEach(id => {
                const el = document.getElementById(id);
                // Only hide if currently displayed (optional check but good for logic)
                if (el && el.style.display !== 'none') {
                    el.style.display = 'none';
                    if (id === 'delete-confirm-modal') {
                        // Reset pending delete safety
                        try { pendingDeleteId = null; } catch (e) { }
                    }
                }
            });
            // Also close menus
            document.querySelectorAll('.action-menu').forEach(el => el.style.display = 'none');
        }
    });

    // Centralized Event Delegation for Dynamic Elements
    const formContainer = document.getElementById('agendaForm');
    if (formContainer) {
        formContainer.addEventListener('click', (e) => {
            // Remove Speaker
            if (e.target.closest('.btn-remove-speaker')) {
                e.preventDefault();
                const btn = e.target.closest('.btn-remove-speaker');
                removeSpeaker(btn.dataset.id);
            }
            // Remove Dynamic List Item
            if (e.target.closest('.btn-remove-dynamic')) {
                e.preventDefault();
                const btn = e.target.closest('.btn-remove-dynamic');
                removeListItem(btn.dataset.list, btn.dataset.id);
            }
        });

        formContainer.addEventListener('input', (e) => {
            // Update Dynamic List Item
            if (e.target.classList.contains('dynamic-input')) {
                const input = e.target;
                updateListItem(input.dataset.list, input.dataset.id, input.dataset.field, input.value);
            }
        });

        // Search Listener
        const poolSearch = document.getElementById('pool-search');
        if (poolSearch) {
            poolSearch.addEventListener('input', (e) => {
                renderMemberPool(null, null, e.target.value);
            });
        }
    }
}

// === Ported Features ===

function toggleFastMeeting(isFast) {
    const interHymnWrapper = document.getElementById('intermediate-hymn-wrapper');
    const fastNote = document.getElementById('fast-meeting-note');
    const btnAddSpeaker = document.getElementById('btn-add-speaker');
    const speakersContainer = document.getElementById('speakers-input-container');

    if (isFast) {
        if (interHymnWrapper) interHymnWrapper.style.display = 'none';
        if (btnAddSpeaker) btnAddSpeaker.style.display = 'none';
        if (speakersContainer) speakersContainer.style.display = 'none';
        if (fastNote) fastNote.style.display = 'block';
    } else {
        if (interHymnWrapper) interHymnWrapper.style.display = 'block';
        if (btnAddSpeaker) btnAddSpeaker.style.display = 'block'; // Or whatever default display was
        if (speakersContainer) speakersContainer.style.display = 'block';
        if (fastNote) fastNote.style.display = 'none';
    }
}

async function exportPDF() {
    // Ensure we have the library
    if (typeof html2pdf === 'undefined') {
        showToast("Biblioteca PDF não carregada. Verifique a internet.", 'error');
        return;
    }

    const element = document.getElementById('agenda-paper');
    // We need to POPULATE the agenda-paper first! 
    // The previous logic in app.js assumed it was populated or populate it?
    // app.js didn't show population logic in the snippet.
    // Wait, the PDF generation usually requires rendering the "print view".
    // I should probably render the print view into 'agenda-paper' before calling html2pdf.
    // For now, I will just port the trigger, but I might need a 'renderPrintView' function.
    // Assuming 'agenda-paper' is populated or I need to populate it.
    // Let's check if there is a render function. Failing that, I will just alert for now or try to clone the editor?
    // Actually, let's implement a basic render to 'agenda-paper' here to ensure it works.

    renderPrintView(element);

    const dateInput = document.querySelector('input[name="date"]');
    const dateValue = dateInput ? dateInput.value : '';
    const filename = dateValue ? `agenda_sacramental_${dateValue}.pdf` : 'agenda_sacramental.pdf';

    const opt = {
        margin: 0,
        filename: filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(element).save();
}

function renderPrintView(container) {
    const dateStr = formatDate(state.currentEditorDate);

    // Helper to safely get input values
    const getVal = (name) => {
        const el = document.querySelector(`input[name="${name}"]`);
        return el ? escapeHtml(el.value) : '';
    };

    container.innerHTML = `
        <div style="font-family: 'Playfair Display', serif; text-align: center; margin-bottom: 2rem;">
            <h1>Agenda Sacramental</h1>
            <h3>${escapeHtml(state.wardName || 'Ala')}</h3>
            <p>${escapeHtml(dateStr)}</p>
        </div>
        <div style="font-family: 'Inter', sans-serif;">
            <div style="margin-bottom: 1rem;"><strong>Preside:</strong> ${getVal('presiding')}</div>
            <div style="margin-bottom: 1rem;"><strong>Dirige:</strong> ${getVal('conducting')}</div>
            <hr>
            <div style="margin: 1rem 0;">
                <div><strong>Hino de Abertura:</strong> ${getVal('openingHymn')}</div>
                <div><strong>Hino Sacramental:</strong> ${getVal('sacramentHymn')}</div>
                <div><strong>Hino de Encerramento:</strong> ${getVal('closingHymn')}</div>
            </div>
            <hr>
            <div style="margin: 1rem 0;">
                <h4>Programa</h4>
                ${state.speakers.map(s => `
                    <div style="margin-bottom:0.5rem;">
                        <strong>${s.type === 'hymn' ? 'Hino Especial' : 'Orador'}:</strong> ${escapeHtml(s.name || s.text || '')}
                    </div>
                `).join('')}
            </div>
             <hr>
            <div style="margin: 1rem 0;">
                <div><strong>Primeira Oração:</strong> ${getVal('invocation')}</div>
                <div><strong>Última Oração:</strong> ${getVal('benediction')}</div>
            </div>
        </div>
    `;
}

// === Auth Logic (Preserved) ===
function initAuth() {
    const overlay = document.getElementById('auth-overlay');
    const googleBtn = document.getElementById('login-btn');
    const emailGroup = document.getElementById('email-auth-group');
    const errorMsg = document.getElementById('auth-error');
    const logoutBtn = document.getElementById('logout-btn');

    if (googleBtn) {
        // VISIBLE DEBUGGING
        console.log("Auth Button Found. Attaching listener...");

        googleBtn.addEventListener('click', async () => {
            // 1. Prove the button works
            console.log("Attempting Google Auth...");

            const provider = new GoogleAuthProvider();
            try {
                await signInWithPopup(auth, provider);
            } catch (error) {
                showToast("Erro Firebase: " + error.message, 'error');
                console.error("Firebase Error:", error);
                if (errorMsg) errorMsg.textContent = "Erro: " + error.message;
            }
        });
    } else {
        console.error("CRITICAL: Login button not found in DOM.");
    }

    if (emailGroup) setupEmailAuthListeners(errorMsg);

    logoutBtn.addEventListener('click', () => {
        signOut(auth);
        window.location.href = 'index.html';
    });

    onAuthStateChanged(auth, async (user) => {
        state.user = user;
        if (user) {
            try {
                const profile = await DM.initUser(user);
                if (profile.hasWard) {
                    if (profile.status === 'pending') {
                        showPendingScreen(overlay);
                        return;
                    }

                    overlay.style.display = 'none';
                    state.wardName = await DM.getWardName();
                    state.role = profile.role;

                    // Update UI texts
                    updateWardNameUI(state.wardName);

                    if (state.role === 'admin' || state.role === 'owner') {
                        document.getElementById('nav-admin').style.display = 'flex';
                    }

                    // Initial Data Load
                    await loadData();

                    // Render Default View
                    document.querySelector('[data-target="view-dashboard"]').click();

                } else {
                    showOnboarding(user, overlay);
                }
            } catch (e) {
                console.error(e);
                errorMsg.textContent = "Erro: " + e.message;
            }
        } else {
            overlay.style.display = 'flex';
        }
    });
}

function updateWardNameUI(name) {
    const dashTitle = document.getElementById('dashboard-ward-name');
    if (dashTitle) dashTitle.textContent = name;
}

// ... (Email Auth & Onboarding Helpers same as before, abbreviated here for brevity) ...
// Assuming showPendingScreen/showOnboarding/setupEmailAuthListeners logic is standard and preserved.
// I will include them to ensure functionality.
function setupEmailAuthListeners(errorDisplay) {
    const btnLogin = document.getElementById('btn-email-login');
    const btnToggle = document.getElementById('btn-signup-toggle');
    const emailIn = document.getElementById('email-input');
    const passIn = document.getElementById('password-input');
    let isSignup = false;

    if (btnToggle) {
        btnToggle.addEventListener('click', (e) => {
            e.preventDefault();
            isSignup = !isSignup;
            btnToggle.textContent = isSignup ? "Já tenho conta" : "Criar conta";
            btnLogin.textContent = isSignup ? "Registar" : "Entrar";
            if (isSignup) showToast("Nota: Para criar uma nova ala, registe-se e depois crie a ala.");
        });
    }

    btnLogin.addEventListener('click', async () => {
        try {
            if (isSignup) await createUserWithEmailAndPassword(auth, emailIn.value, passIn.value);
            else await signInWithEmailAndPassword(auth, emailIn.value, passIn.value);
        } catch (e) { errorDisplay.textContent = e.message; }
    });
}

function showPendingScreen(overlay) {
    overlay.innerHTML = `<div class="auth-box"><h3>Acesso Pendente</h3><p>Aguarde aprovação do administrador.</p><button onclick="window.location.reload()" class="btn btn-secondary">Atualizar</button></div>`;
}
function showOnboarding(user, overlay) {
    // Simplified onboarding reused
    overlay.querySelector('.auth-box').innerHTML = `
        <h3>Bem-vindo!</h3>
        <p>Para começar, crie ou junte-se a uma ala.</p>
        <input type="text" id="new-ward" placeholder="Nome da Nova Ala" class="premium-input" style="margin:1rem 0">
        <button id="btn-create-ward" class="btn btn-primary" style="width:100%">Criar Ala</button>
        <hr style="margin:1rem 0">
        <input type="text" id="join-id" placeholder="ID da Ala" class="premium-input">
        <button id="btn-join-ward" class="btn btn-secondary" style="width:100%; margin-top:0.5rem">Juntar-se</button>
    `;
    document.getElementById('btn-create-ward').onclick = async () => {
        await DM.createWard(document.getElementById('new-ward').value);
        window.location.reload();
    };
    document.getElementById('btn-join-ward').onclick = async () => {
        await DM.joinWard(document.getElementById('join-id').value);
        window.location.reload();
    };
}


// === Navigation ===
function setupNavigation() {
    // 1. Sidebar Expansion Logic
    const nav = document.querySelector('.app-nav');
    const toggleBtn = document.querySelector('.nav-toggle');
    const savedState = localStorage.getItem('sidebarExpanded');

    // Helper to update UI based on state
    const updateToggleState = (isExpanded) => {
        if (!toggleBtn) return;
        const icon = toggleBtn.querySelector('i');
        if (isExpanded) {
            icon.className = 'ph ph-caret-double-left';
            toggleBtn.title = "Recolher Menu";
        } else {
            icon.className = 'ph ph-caret-double-right';
            toggleBtn.title = "Expandir Menu";
        }
    };

    if (savedState === 'true') {
        nav.classList.add('expanded');
        updateToggleState(true);
    }

    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            nav.classList.toggle('expanded');
            const isExpanded = nav.classList.contains('expanded');
            localStorage.setItem('sidebarExpanded', isExpanded);
            updateToggleState(isExpanded);
        });
    }

    // 2. Navigation Items
    const navItems = document.querySelectorAll('.nav-item[data-target]');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            // Active State
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');

            // View Switch
            const targetId = item.getAttribute('data-target');
            document.querySelectorAll('.view-container').forEach(v => v.classList.remove('active'));
            document.getElementById(targetId).classList.add('active');

            // View Logic Triggers
            if (targetId === 'view-dashboard') renderDashboard();
            if (targetId === 'view-timeline') renderTimeline();
            if (targetId === 'view-roster') renderRoster();
            if (targetId === 'view-admin') renderAdmin();
            // view-planner (Editor) doesn't auto-render, it waits for date selection or manual interaction
        });
    });
}

// Editor Tab Switching
function switchEditorTab(tabName) {
    const tabs = ['speakers', 'hymns', 'prayers', 'full', 'stats']; // stats is internal

    // Update Buttons
    document.querySelectorAll('.segment-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`.segment-btn[onclick*="${tabName}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    // Show/Hide Sections
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');

    const formContainer = document.getElementById('agendaForm');

    if (tabName === 'full') {
        document.getElementById('tab-speakers').style.display = 'block';
        document.getElementById('tab-hymns').style.display = 'block';
        document.getElementById('tab-prayers').style.display = 'block';
        document.getElementById('tab-stats').style.display = 'block';
        document.getElementById('tab-extras').style.display = 'block';

        // Single Column Mode
        formContainer.classList.add('single-column-mode');
    } else {
        // Individual Tabs
        document.getElementById(`tab-${tabName}`).style.display = 'block';

        if (tabName === 'speakers') {
            formContainer.classList.remove('single-column-mode'); // Split View
        } else {
            formContainer.classList.add('single-column-mode'); // Single View
        }
    }
};


// === Data Loading ===
async function loadData() {
    try {
        state.members = await DM.getMembers(); // Load all members
        state.futurePlans = await DM.getFuturePlans(); // Load Plans
    } catch (e) { console.error("Error loading data", e); }
}


// === VIEW 1: HERO DASHBOARD ===
async function renderDashboard() {
    // 1. Calculate Next Sunday
    const today = new Date();
    const nextSunday = getNextSunday(today);
    const dateStr = nextSunday.toISOString().split('T')[0];

    // 2. Check status
    const existingPlan = state.futurePlans.find(p => p.dateStr === dateStr);
    const heroDateEl = document.getElementById('hero-date');
    const heroThemeEl = document.getElementById('hero-theme');
    const statusDot = document.querySelector('.hero-status .status-dot');

    // Format Date: DD/MM/YYYY
    const formattedDate = formatDate(dateStr);
    heroDateEl.textContent = formattedDate;

    if (existingPlan) {
        heroThemeEl.textContent = existingPlan.presiding ? `Preside: ${existingPlan.presiding}` : 'Em planeamento...';
        statusDot.className = 'status-dot planned';
        // Bind Edit Button
        const btn = document.querySelector('#focus-hero button');
        btn.onclick = () => editPlan(dateStr);
        btn.innerHTML = `<i class="ph ph-pencil-simple"></i> Editar Plano`;
    } else {
        heroThemeEl.textContent = "Nada planeado ainda.";
        statusDot.className = 'status-dot draft';
        const btn = document.querySelector('#focus-hero button');
        btn.onclick = () => editPlan(dateStr);
        btn.innerHTML = `<i class="ph ph-plus"></i> Iniciar Plano`;
    }

    // 3. Render Upcoming List
    const listContainer = document.getElementById('dashboard-upcoming-list');
    listContainer.innerHTML = '';

    // Generate next 4 weeks
    for (let i = 1; i <= 4; i++) {
        const futureDate = new Date(nextSunday);
        futureDate.setDate(nextSunday.getDate() + (i * 7));
        const fStr = futureDate.toISOString().split('T')[0];
        const plan = state.futurePlans.find(p => p.dateStr === fStr);

        const div = document.createElement('div');
        div.className = 'timeline-item';
        div.onclick = () => editPlan(fStr);

        div.innerHTML = `
            <div class="t-date">
                ${futureDate.getDate()}
                <span>${futureDate.toLocaleString('pt-PT', { month: 'short' }).replace('.', '').replace(/^\w/, c => c.toUpperCase())}</span>
            </div>
            <div class="t-info">
                <h4>Domingo</h4>
                <p>${plan ? (plan.presiding || 'Rascunho') : 'Não planeado'}</p>
            </div>
            <div class="status-dot ${plan ? 'planned' : 'draft'}"></div>
        `;
        listContainer.appendChild(div);
    }
}

function getNextSunday(fromDate) {
    const d = new Date(fromDate);
    d.setDate(d.getDate() + (7 - d.getDay()) % 7);
    if (d <= fromDate) d.setDate(d.getDate() + 7); // Ensure it's future
    return d;
}


// === VIEW 2: VERTICAL TIMELINE ===
async function renderTimeline() {
    const container = document.getElementById('timeline-container');
    container.innerHTML = '';

    // Generate 3 Months
    const start = new Date();
    const end = new Date();
    end.setMonth(end.getMonth() + 3);

    let current = getNextSunday(new Date()); // Start from next sunday
    if (current < start) current.setDate(current.getDate() + 7);

    let currentMonthLabel = '';
    let monthGroup = null;

    while (current <= end) {
        const dateStr = current.toISOString().split('T')[0];
        const monthName = current.toLocaleString('pt-PT', { month: 'long', year: 'numeric' });

        // New Month Group
        if (monthName !== currentMonthLabel) {
            currentMonthLabel = monthName;

            const monthHeader = document.createElement('div');
            monthHeader.className = 'timeline-month';
            monthHeader.innerHTML = `<div class="timeline-month-title">${monthName}</div><div class="timeline-list"></div>`;
            container.appendChild(monthHeader);
            monthGroup = monthHeader.querySelector('.timeline-list');
        }

        // Check Plan
        const plan = state.futurePlans.find(p => p.dateStr === dateStr);

        const div = document.createElement('div');
        div.className = 'timeline-item';
        div.onclick = () => editPlan(dateStr);

        const dateObj = new Date(dateStr);
        const monthShort = dateObj.toLocaleString('pt-PT', { month: 'short' }).replace('.', '').replace(/^\w/, c => c.toUpperCase());

        div.innerHTML = `
            <div class="t-date">
                ${dateObj.getDate()}
                <span>${monthShort}</span>
            </div>
            <div class="t-info">
                <h4>${plan ? 'Reunião Planeada' : 'Disponível'}</h4>
                <p>${plan ? renderPlanSummary(plan) : 'Toque para planear'}</p>
            </div>
            <div class="status-dot ${plan && plan.speakers && plan.speakers.length > 0 ? 'planned' : 'draft'}"></div>
        `;
        monthGroup.appendChild(div);

        // Next week
        current.setDate(current.getDate() + 7);
    }
}

function renderPlanSummary(plan) {
    // Return a short string describing the plan
    let s = [];
    if (plan.speakers && plan.speakers.length > 0) s.push(`${plan.speakers.filter(k => k.type === 'speaker').length} Oradores`);
    if (plan.openingHymn) s.push(`Hino ${plan.openingHymn.split(' ')[0]}`);
    return s.join(' • ') || 'Detalhes do rascunho...';
}

// === VIEW 3: WORKBENCH EDITOR ===

// 1. Navigation to Editor
async function editPlan(dateStr) {
    state.currentEditorDate = dateStr;
    state.speakers = [];
    state.recognitions = [];
    state.announcements = [];
    state.releases = [];
    state.callings = [];

    // Switch View
    document.querySelector('[data-target="view-planner"]').click();

    // Update Header
    let formatted = formatDate(dateStr);
    document.getElementById('editor-date-display').textContent = formatted;
    document.getElementById('input-date').value = dateStr;

    // Load Plan?
    const plan = state.futurePlans.find(p => p.dateStr === dateStr);

    // Reset Form
    const form = document.getElementById('agendaForm');
    form.reset();
    document.getElementById('input-date').value = dateStr; // Re-set date

    if (plan) {
        // Fill fields
        ['presiding', 'conducting', 'organist', 'chorister', 'openingHymn', 'sacramentHymn', 'closingHymn', 'invocation', 'benediction'].forEach(k => {
            if (form[k]) form[k].value = plan[k] || '';
        });
        // Stats
        ['att_sacrament'].forEach(k => { if (form[k]) form[k].value = plan.attendance?.[k.replace('att_', '')] || ''; });

        // Speakers
        state.speakers = plan.speakers || [];
        // Extras
        state.recognitions = plan.recognitions || [];
        state.announcements = plan.announcements || [];
        state.releases = plan.releases || [];
        state.callings = plan.callings || [];
    } else {
        // Defaults
        state.speakers = [];
        state.recognitions = [];
        state.announcements = [];
        state.releases = [];
        state.callings = [];
    }

    renderSpeakersInput();
    renderAllDynamicLists();

    // Initialize with Plan mode
    setPlannerMode('PLAN');
    renderPlanSubTab('speakers');
};

// 2. Member Pool Logic
async function renderMemberPool(filterGender = null, filterGroup = null, searchTerm = '') {
    const listEl = document.getElementById('member-pool-list');
    listEl.innerHTML = ''; // Loading or Clear

    // 1. Filter
    let pool = state.members.filter(m => {
        if (filterGender && m.gender !== filterGender) return false;
        if (filterGroup && m.group !== filterGroup) return false; // Simple group match
        if (filterGroup === 'Youth' && m.group !== 'Youth') return false;
        if (searchTerm && !m.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
        return true;
    });

    // 2. Sort Logic (Nulls First, then Date Ascending)
    pool.sort((a, b) => {
        // Nulls first
        const dateA = a.last_talk_date ? a.last_talk_date.toDate().getTime() : 0;
        const dateB = b.last_talk_date ? b.last_talk_date.toDate().getTime() : 0;

        if (dateA === 0 && dateB !== 0) return -1;
        if (dateA !== 0 && dateB === 0) return 1;

        // Ascending (Oldest first)
        return dateA - dateB;
    });

    // 3. Render
    pool.slice(0, 50).forEach(m => { // Limit render
        const div = document.createElement('div');
        div.className = 'member-item';

        // Status Badge logic
        let statusBadge = `<span class="status-indicator status-green">Nunca falou</span>`;
        let lastDateStr = '';

        if (m.last_talk_date) {
            const d = m.last_talk_date.toDate();
            // Check if recent (< 3 months)
            const threeMonthsAgo = new Date();
            threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

            if (d > threeMonthsAgo) {
                statusBadge = `<span class="status-indicator status-warn">Recente</span>`;
            } else {
                statusBadge = `<span class="status-indicator status-ok">Disponível</span>`;
            }
            lastDateStr = d.toLocaleDateString();
        }

        div.innerHTML = `
            <div class="member-info">
                <h4>${m.name}</h4>
                <p>${lastDateStr ? 'Último: ' + lastDateStr : 'Sem registo'}</p>
            </div>
            ${statusBadge}
        `;

        // Click to Insert
        div.onclick = () => insertMemberIntoActiveInput(m);

        listEl.appendChild(div);
    });
}

function insertMemberIntoActiveInput(member) {
    if (state.activeMemberInput) {
        state.activeMemberInput.value = member.name;
        // Trigger event
        const event = new Event('input', { bubbles: true });
        state.activeMemberInput.dispatchEvent(event);

        // Visual Feedback
        state.activeMemberInput.style.borderColor = varCss('--success');
        setTimeout(() => state.activeMemberInput.style.borderColor = '', 1000);
    } else {
        showToast("Selecione um campo de orador à esquerda primeiro.", 'warning');
    }
}
function varCss(name) { return getComputedStyle(document.documentElement).getPropertyValue(name); }

// === PLAN vs FULL Mode Logic ===

function setPlannerMode(mode) {
    state.viewMode = mode;
    const planContainer = document.getElementById('planner-mode-plan');
    const fullContainer = document.getElementById('planner-mode-full');

    // Toggle visibility
    if (mode === 'PLAN') {
        if (planContainer) planContainer.style.display = 'grid';
        if (fullContainer) fullContainer.style.display = 'none';
    } else {
        if (planContainer) planContainer.style.display = 'none';
        if (fullContainer) fullContainer.style.display = 'block';
        // In FULL mode, show all tabs
        switchEditorTab('full');
        renderMemberPool();
    }

    // Update toggle button active states
    document.querySelectorAll('.mode-toggle-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });
}

function renderPlanSubTab(tabName) {
    state.activeSubTab = tabName;
    const container = document.getElementById('plan-input-container');
    const assistantList = document.getElementById('assistant-list');
    if (!container) return;

    // Update subnav active state
    document.querySelectorAll('.plan-subnav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.subtab === tabName);
    });

    // Clear & inject content based on tab
    container.innerHTML = '';

    if (tabName === 'speakers') {
        container.innerHTML = `
            <div class="form-section">
                <h3>Programa Espiritual</h3>
                <div id="plan-speakers-list"></div>
                <button class="btn btn-secondary" id="plan-add-speaker" style="width:100%; margin-top:0.5rem;">+ Adicionar Orador</button>
                <div id="plan-hymn-wrapper">
                    <button class="btn btn-secondary" id="plan-add-hymn" style="width:100%; margin-top:0.5rem; color:var(--text-light); border-style:dashed;">+ Adicionar Hino Interm.</button>
                </div>
            </div>
        `;
        renderPlanSpeakers();
        document.getElementById('plan-add-speaker')?.addEventListener('click', () => {
            addSpeakerUI();
            renderPlanSpeakers();
        });
        document.getElementById('plan-add-hymn')?.addEventListener('click', () => {
            addProgramHymnUI();
            renderPlanSpeakers();
        });
        // Show member recommendations
        renderSmartRecommendations('speakers');
    } else if (tabName === 'hymns') {
        container.innerHTML = `
            <div class="form-section">
                <h3>Música</h3>
                <div class="input-grid" style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem; margin-bottom:1.5rem;">
                    <div class="input-wrapper">
                        <label>Regente</label>
                        <input type="text" id="plan-chorister" placeholder="Nome..." value="${getPlanFormValue('chorister')}">
                    </div>
                    <div class="input-wrapper">
                        <label>Pianista</label>
                        <input type="text" id="plan-organist" placeholder="Nome..." value="${getPlanFormValue('organist')}">
                    </div>
                </div>
                <div class="hymn-input-wrapper">
                    <label>Hino de Abertura</label>
                    <input type="text" class="plan-hymn-search" id="plan-openingHymn" placeholder="Número ou Título..." value="${getPlanFormValue('openingHymn')}">
                    <div class="hymn-results"></div>
                </div>
                <div class="hymn-input-wrapper">
                    <label>Hino Sacramental</label>
                    <input type="text" class="plan-hymn-search" id="plan-sacramentHymn" placeholder="Número ou Título..." value="${getPlanFormValue('sacramentHymn')}">
                    <div class="hymn-results"></div>
                </div>
                <div class="hymn-input-wrapper">
                    <label>Hino de Encerramento</label>
                    <input type="text" class="plan-hymn-search" id="plan-closingHymn" placeholder="Número ou Título..." value="${getPlanFormValue('closingHymn')}">
                    <div class="hymn-results"></div>
                </div>
            </div>
        `;
        // Sync plan inputs back to full form
        ['chorister', 'organist'].forEach(name => {
            const planInput = document.getElementById(`plan-${name}`);
            if (planInput) {
                planInput.addEventListener('input', () => syncToFullForm(name, planInput.value));
            }
        });
        // Setup hymn search on plan inputs
        container.querySelectorAll('.plan-hymn-search').forEach(inp => {
            const fieldName = inp.id.replace('plan-', '');
            setupHymnSearch(inp, window.hymns, async (val) => {
                syncToFullForm(fieldName, val);
                await checkHymnWarning(inp, val);
            });
            inp.addEventListener('input', () => syncToFullForm(fieldName, inp.value));
        });
        // Show hymn info in assistant
        if (assistantList) {
            assistantList.innerHTML = `
                <div style="text-align:center; padding:2rem; color:var(--text-light); font-size:0.85rem;">
                    <i class="ph ph-music-notes" style="font-size:2rem;"></i>
                    <p style="margin-top:0.5rem;">Pesquise hinos nos campos à esquerda.<br>Os avisos de repetição aparecem automaticamente.</p>
                </div>
            `;
        }
    } else if (tabName === 'prayers') {
        container.innerHTML = `
            <div class="form-section">
                <h3>Orações</h3>
                <div class="input-wrapper" style="margin-bottom:1rem;">
                    <label>Primeira Oração</label>
                    <div class="member-search-wrapper">
                        <input type="text" class="plan-member-search" id="plan-invocation" placeholder="Nome do membro..." value="${getPlanFormValue('invocation')}">
                        <div class="member-results"></div>
                    </div>
                </div>
                <div class="input-wrapper">
                    <label>Última Oração</label>
                    <div class="member-search-wrapper">
                        <input type="text" class="plan-member-search" id="plan-benediction" placeholder="Nome do membro..." value="${getPlanFormValue('benediction')}">
                        <div class="member-results"></div>
                    </div>
                </div>
            </div>
        `;
        // Setup member search on plan prayer inputs
        container.querySelectorAll('.plan-member-search').forEach(inp => {
            const fieldName = inp.id.replace('plan-', '');
            inp.addEventListener('focus', () => state.activeMemberInput = inp);
            inp.addEventListener('input', () => {
                syncToFullForm(fieldName, inp.value);
                const val = inp.value.toLowerCase();
                const resBox = inp.parentElement.querySelector('.member-results');
                resBox.innerHTML = '';
                if (val.length < 2) return;
                const matches = state.members.filter(m => m.name.toLowerCase().includes(val)).slice(0, 5);
                matches.forEach(m => {
                    const r = document.createElement('div');
                    r.className = 'hymn-result-item';
                    r.innerText = m.name;
                    r.onclick = () => {
                        inp.value = m.name;
                        resBox.innerHTML = '';
                        syncToFullForm(fieldName, m.name);
                    };
                    resBox.appendChild(r);
                });
            });
        });
        // Show prayer member recommendations
        renderSmartRecommendations('prayers');
    }
}

function renderPlanSpeakers() {
    const container = document.getElementById('plan-speakers-list');
    if (!container) return;
    container.innerHTML = '';

    state.speakers.forEach((item, index) => {
        const div = document.createElement('div');

        if (item.type === 'speaker') {
            div.className = 'speaker-row-edit';
            div.innerHTML = `
                <div class="input-wrapper">
                    <label>Orador ${index + 1}</label>
                    <input type="text" class="plan-speaker-input" data-id="${item.id}" value="${item.name || ''}" placeholder="Nome do membro...">
                </div>
                <button class="btn btn-danger btn-remove-speaker" data-id="${item.id}" style="position:absolute; top:10px; right:10px; padding:4px 8px; font-size:0.75rem;">×</button>
            `;
            const input = div.querySelector('input');
            input.addEventListener('focus', () => state.activeMemberInput = input);
            input.addEventListener('input', (e) => {
                item.name = e.target.value;
                const m = state.members.find(x => x.name === e.target.value);
                item.memberId = m ? m.id : null;
            });
        } else if (item.type === 'hymn') {
            div.className = 'speaker-row-edit hymn';
            div.innerHTML = `
                <div class="hymn-input-wrapper" style="margin-bottom:0">
                    <label>Hino Intermediário</label>
                    <input type="text" class="hymn-search" value="${item.name || ''}" placeholder="Número ou Título...">
                    <div class="hymn-results"></div>
                </div>
                <button class="btn btn-danger btn-remove-speaker" data-id="${item.id}" style="position:absolute; top:10px; right:10px;">×</button>
            `;
            const input = div.querySelector('input');
            setupHymnSearch(input, window.hymns, (val) => { item.name = val; });
            input.addEventListener('input', (e) => item.name = e.target.value);
        }

        container.appendChild(div);
    });

    // Handle remove clicks via delegation
    container.addEventListener('click', (e) => {
        if (e.target.closest('.btn-remove-speaker')) {
            const id = e.target.closest('.btn-remove-speaker').dataset.id;
            removeSpeaker(id);
            renderPlanSpeakers();
        }
    });
}

function getPlanFormValue(name) {
    const fullForm = document.getElementById('agendaForm');
    if (fullForm && fullForm[name]) return fullForm[name].value || '';
    return '';
}

function syncToFullForm(name, value) {
    const fullForm = document.getElementById('agendaForm');
    if (fullForm && fullForm[name]) fullForm[name].value = value;
}

function renderSmartRecommendations(category) {
    const listEl = document.getElementById('assistant-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    // Filter
    let pool = state.members.filter(m => {
        if (state.assistantFilterGender && m.gender !== state.assistantFilterGender) return false;
        if (state.assistantFilterGroup && m.group !== state.assistantFilterGroup) return false;
        return true;
    });

    // Sort: nulls first (never spoke), then ascending by last_talk_date
    pool.sort((a, b) => {
        const dateA = a.last_talk_date ? a.last_talk_date.toDate().getTime() : 0;
        const dateB = b.last_talk_date ? b.last_talk_date.toDate().getTime() : 0;
        if (dateA === 0 && dateB !== 0) return -1;
        if (dateA !== 0 && dateB === 0) return 1;
        return dateA - dateB;
    });

    if (pool.length === 0) {
        listEl.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-light); font-size:0.85rem;">Nenhum membro encontrado.</div>';
        return;
    }

    pool.slice(0, 30).forEach(m => {
        const card = document.createElement('div');
        card.className = 'suggestion-card';

        let statusBadge = '<span class="status-indicator status-green">Nunca falou</span>';
        let lastDateStr = 'Sem registo';
        if (m.last_talk_date) {
            const d = m.last_talk_date.toDate();
            const threeMonthsAgo = new Date();
            threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
            if (d > threeMonthsAgo) {
                statusBadge = '<span class="status-indicator status-warn">Recente</span>';
            } else {
                statusBadge = '<span class="status-indicator status-ok">Disponível</span>';
            }
            lastDateStr = 'Último: ' + d.toLocaleDateString();
        }

        card.innerHTML = `
            <div>
                <div class="card-name">${m.name}</div>
                <div class="card-meta">${lastDateStr}</div>
            </div>
            ${statusBadge}
        `;

        card.addEventListener('click', () => {
            insertMemberIntoActiveInput(m);
        });

        listEl.appendChild(card);
    });
}

function toggleAssistantFilter(type) {
    const chips = document.querySelectorAll('#assistant-filters .filter-chip');

    if (type === 'Youth') {
        if (state.assistantFilterGroup === 'Youth') {
            state.assistantFilterGroup = null;
        } else {
            state.assistantFilterGroup = 'Youth';
            state.assistantFilterGender = null;
        }
    } else {
        if (state.assistantFilterGender === type) {
            state.assistantFilterGender = null;
        } else {
            state.assistantFilterGender = type;
            state.assistantFilterGroup = null;
        }
    }

    // Update chip active states
    chips.forEach(c => {
        const f = c.dataset.filter;
        if (f === 'Youth') {
            c.classList.toggle('active', state.assistantFilterGroup === 'Youth');
        } else {
            c.classList.toggle('active', state.assistantFilterGender === f);
        }
    });

    renderSmartRecommendations(state.activeSubTab);
}

async function checkHymnWarning(inputEl, val) {
    // Remove any existing warning
    const existingWarning = inputEl.parentElement.querySelector('.hymn-warning-box');
    if (existingWarning) existingWarning.remove();
    inputEl.style.borderColor = '';

    if (!val) return;
    const num = val.split(' - ')[0];
    try {
        const recent = await DM.checkHymnHistory(num);
        if (recent) {
            inputEl.style.borderColor = varCss('--danger');
            const warning = document.createElement('div');
            warning.className = 'hymn-warning-box';
            warning.innerHTML = `<i class="ph ph-warning-circle"></i> Este hino foi cantado em ${recent.date.toLocaleDateString()}`;
            inputEl.parentElement.appendChild(warning);
        }
    } catch (e) {
        console.warn('Hymn history check failed:', e);
    }
}

// Filter Toggles
function togglePoolFilter(type) {
    // Check if active
    const chips = document.querySelectorAll('.filter-chip');
    let activeFilter = null;

    chips.forEach(c => {
        if (c.innerText.includes(type === 'M' ? 'Homens' : (type === 'F' ? 'Mulheres' : 'Jovens'))) {
            if (c.classList.contains('active')) {
                c.classList.remove('active');
            } else {
                // Clear others? Or allow multi? Let's allow single filter for simplicity or toggle
                document.querySelectorAll('.filter-chip').forEach(x => x.classList.remove('active'));
                c.classList.add('active');
                activeFilter = type;
            }
        }
    });

    const search = document.getElementById('pool-search').value;
    // Map View Logic Filter
    let gender = null;
    let group = null;

    if (activeFilter === 'M' || activeFilter === 'F') gender = activeFilter;
    if (activeFilter === 'Youth') group = 'Youth';

    renderMemberPool(gender, group, search);
};



// 3. Speakers Input Logic
function renderSpeakersInput() {
    const container = document.getElementById('speakers-input-container');
    container.innerHTML = '';

    state.speakers.forEach((item, index) => {
        const div = document.createElement('div');

        if (item.type === 'speaker') {
            div.className = 'speaker-row-edit';
            div.innerHTML = `
                 <div class="input-wrapper">
                    <label>Orador ${index + 1}</label>
                    <input type="text" class="speaker-name-input" data-id="${item.id}" value="${item.name || ''}" placeholder="Nome do membro...">
                </div>
                <!-- Remove button -->
                <button class="btn btn-danger btn-remove-speaker" data-id="${item.id}" style="position:absolute; top:10px; right:10px; padding:4px 8px; font-size:0.75rem;">×</button>
            `;

            // Bind Input focus for "Click to Insert"
            const input = div.querySelector('input');
            input.addEventListener('focus', () => state.activeMemberInput = input);
            input.addEventListener('input', (e) => {
                item.name = e.target.value;
                // Look up ID?
                const m = state.members.find(x => x.name === e.target.value);
                item.memberId = m ? m.id : null;
            });

        } else if (item.type === 'hymn') {
            div.className = 'speaker-row-edit hymn';
            div.innerHTML = `
                <div class="hymn-input-wrapper" style="margin-bottom:0">
                    <label>Hino Intermediário</label>
                    <input type="text" class="hymn-search" value="${item.name || ''}" placeholder="Número ou Título...">
                    <div class="hymn-results"></div>
                </div>
                <button class="btn btn-danger btn-remove-speaker" data-id="${item.id}" style="position:absolute; top:10px; right:10px;">×</button>
            `;

            const input = div.querySelector('input');
            setupHymnSearch(input, window.hymns, (val) => { item.name = val; });
            input.addEventListener('input', (e) => item.name = e.target.value);
        }

        container.appendChild(div);
    });
}

// Local functions for speaker management
function addSpeakerUI() {
    state.speakers.push({ id: crypto.randomUUID(), type: 'speaker', name: '' });
    renderSpeakersInput();
}
function addProgramHymnUI() {
    state.speakers.push({ id: crypto.randomUUID(), type: 'hymn', name: '' });
    renderSpeakersInput();
}
function removeSpeaker(id) {
    state.speakers = state.speakers.filter(s => s.id !== id);
    renderSpeakersInput();
}


// function setupHymnSearch ... MOVED TO utils/uiUtils.js

// Init static searches
function setupFormListeners() {
    document.querySelectorAll('.hymn-search').forEach(inp => {
        setupHymnSearch(inp, window.hymns, async (val) => {
            // Handle Selection Callback (Replaces logic that was inside setupHymnSearch)
            const num = val.split(' - ')[0]; // Extract number if format is "123 - Title"
            const warningEl = inp.parentElement.querySelector('.warning-text');

            // Check History
            const recent = await DM.checkHymnHistory(num);
            if (recent) {
                if (warningEl) warningEl.innerHTML = `<i class="ph ph-warning"></i> Cantado em ${recent.date.toLocaleDateString()}`;
                inp.style.borderColor = varCss('--danger');
            } else {
                inp.style.borderColor = '';
            }
        });
    });

    // Member search for prayers
    document.querySelectorAll('.member-search').forEach(inp => {
        const wrapper = inp.parentElement;
        const resBox = wrapper.querySelector('.member-results');

        inp.addEventListener('focus', () => state.activeMemberInput = inp); // Set focus logic

        inp.addEventListener('input', () => {
            const val = inp.value.toLowerCase();
            resBox.innerHTML = '';
            if (val.length < 2) return;

            const matches = state.members.filter(m => m.name.toLowerCase().includes(val)).slice(0, 5);
            matches.forEach(m => {
                const r = document.createElement('div');
                r.className = 'hymn-result-item';
                r.innerText = m.name;
                r.onclick = () => {
                    inp.value = m.name;
                    resBox.innerHTML = '';
                    inp.dispatchEvent(new Event('input'))
                };
                resBox.appendChild(r);
            });
        });
    });

    // Save Button
    document.getElementById('btn-finalize').addEventListener('click', async () => {
        const dateStr = document.getElementById('input-date').value;
        if (!dateStr) return showToast("Selecione uma data", 'warning');

        // Collect Data
        const form = document.getElementById('agendaForm');
        const fd = new FormData(form);
        const data = Object.fromEntries(fd.entries());
        data.speakers = state.speakers;
        data.recognitions = state.recognitions;
        data.announcements = state.announcements;
        data.releases = state.releases;
        data.callings = state.callings;

        data.dateStr = dateStr;
        data.attendance = { sacrament: form['att_sacrament']?.value };

        try {
            await DM.saveFuturePlan(data); // Using dataManager generic save
            showToast("Gravado com sucesso!", 'success');
            loadData(); // Refresh cache
        } catch (e) { showToast("Erro ao gravar: " + e.message, 'error'); }
    });
}

function addListItem(type) {
    const id = crypto.randomUUID();
    if (type === 'releases' || type === 'callings') {
        state[type].push({ id, name: '', calling: '' });
    } else {
        state[type].push({ id, text: '' });
    }
    renderDynamicListInput(type);
}
function removeListItem(type, id) {
    state[type] = state[type].filter(item => item.id !== id);
    renderDynamicListInput(type);
}

function updateListItem(type, id, field, value) {
    const item = state[type].find(i => i.id === id);
    if (item) {
        if (type === 'releases' || type === 'callings') {
            item[field] = value;
        } else {
            item.text = value;
        }
    }
}


function renderAllDynamicLists() {
    ['recognitions', 'announcements', 'releases', 'callings'].forEach(renderDynamicListInput);
}

function renderDynamicListInput(type) {
    const container = document.getElementById(`${type}-input-container`);
    if (!container) return;
    container.innerHTML = '';

    state[type].forEach(item => {
        const row = document.createElement('div');
        row.className = 'input-row';
        row.style.marginBottom = '0.5rem';

        if (type === 'releases' || type === 'callings') {
            row.innerHTML = `
                <input type="text" value="${item.name || ''}" 
                    class="dynamic-input" data-list="${type}" data-id="${item.id}" data-field="name"
                    placeholder="Nome..." style="flex: 1;">
                <input type="text" value="${item.calling || ''}" 
                    class="dynamic-input" data-list="${type}" data-id="${item.id}" data-field="calling"
                    placeholder="Chamado..." style="flex: 1; margin-left: 0.5rem;">
                <button class="btn btn-danger btn-remove-dynamic" data-list="${type}" data-id="${item.id}" style="margin-left:5px; padding:0 8px;">×</button>
            `;
        } else {
            row.innerHTML = `
                <input type="text" value="${item.text || ''}" 
                    class="dynamic-input" data-list="${type}" data-id="${item.id}" data-field="text"
                    placeholder="Item..." style="flex: 1;">
                <button class="btn btn-danger btn-remove-dynamic" data-list="${type}" data-id="${item.id}" style="margin-left:5px; padding:0 8px;">×</button>
            `;
        }
        container.appendChild(row);
    });
}




// === Roster / Member Management ===
// === Roster / Member Management ===
async function renderRoster() {
    const tbody = document.getElementById('roster-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const groupFilter = document.getElementById('filter-group')?.value || 'all';
    const genderFilter = document.getElementById('filter-gender')?.value || 'all';

    let list = state.members;

    // Apply Group Filter
    if (groupFilter !== 'all') {
        list = list.filter(m => m.group === groupFilter);
    }

    // Apply Gender Filter
    if (genderFilter !== 'all') {
        list = list.filter(m => m.gender === genderFilter);
    }

    // Search
    const search = document.getElementById('roster-search')?.value.toLowerCase();
    if (search) {
        list = list.filter(m => m.name.toLowerCase().includes(search));
    }

    list.slice(0, 50).forEach(m => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div class="view-link" data-id="${m.id}" style="font-weight:600; cursor:pointer;">${m.name}</div>
                <div style="font-size:0.8em; color:#666">${m.calling || ''}</div>
            </td>
            <td>${m.group}</td>
            <td>${m.last_talk_date ? formatDateShort(m.last_talk_date) : '-'}</td>
            <td>${m.last_prayer_date ? formatDateShort(m.last_prayer_date) : '-'}</td>
            <td class="action-cell">
                <div class="row-actions">
                    <i class="ph ph-eye action-icon" data-action="view" data-id="${m.id}" title="Ver"></i>
                    <i class="ph ph-pencil-simple action-icon edit" data-action="edit" data-id="${m.id}" title="Editar"></i>
                    <i class="ph ph-trash action-icon delete" data-action="delete" data-id="${m.id}" title="Remover"></i>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Event Delegation for Roster Actions
document.getElementById('roster-tbody')?.addEventListener('click', (e) => {
    const target = e.target;
    // Handle Name Click
    if (target.classList.contains('view-link')) {
        viewMember(target.dataset.id);
        return;
    }
    // Handle Icons
    const actionIcon = target.closest('.action-icon');
    if (actionIcon) {
        const action = actionIcon.dataset.action;
        const id = actionIcon.dataset.id;
        if (action === 'view') viewMember(id);
        if (action === 'edit') editMember(id);
        if (action === 'delete') deleteMember(id);
    }
});

function formatDateShort(ts) {
    if (!ts) return '-';
    return formatDate(ts.toDate());
}

// === Local functions for event delegation ===

function toggleMenu(arg1, arg2) {
    let id = arg1;
    // Check if first arg is an event (has stopPropagation)
    if (arg1 && typeof arg1.stopPropagation === 'function') {
        arg1.stopPropagation();
        id = arg2;
    }

    // Close all other menus
    document.querySelectorAll('.action-menu').forEach(el => {
        if (el.id !== `menu-${id}`) el.style.display = 'none';
    });
    // Toggle this menu
    const menu = document.getElementById(`menu-${id}`);
    if (menu) menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
}

function editMember(id) {
    const member = state.members.find(m => m.id === id);
    if (member) showMemberModal(member);
}

let pendingDeleteId = null;

function deleteMember(id) {
    pendingDeleteId = id;
    const modal = document.getElementById('delete-confirm-modal');
    if (modal) modal.style.display = 'flex';
}

async function viewMember(id) {
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
            const d = t.date.toDate ? t.date.toDate() : new Date(t.date);
            listTalks.innerHTML += `<li>${d.toLocaleDateString()} - ${t.topic}</li>`;
        });

        listPrayers.innerHTML = '';
        if (history.prayers.length === 0) listPrayers.innerHTML = '<li style="color:#aaa">Sem registos recentes</li>';
        history.prayers.forEach(p => {
            const d = p.date.toDate ? p.date.toDate() : new Date(p.date);
            listPrayers.innerHTML += `<li>${d.toLocaleDateString()} - ${p.type}</li>`;
        });

    } catch (e) {
        listTalks.innerHTML = `<li>Erro: ${e.message}</li>`;
    }
}

// === Modal Event Bindings (run after DOM loads) ===
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
                showToast("Erro: " + e.message, 'error');
            }
        });
    }

    // New/Edit Member Logic
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

            if (!name) return showToast("Nome é obrigatório", 'warning');

            try {
                await DM.saveMember({ id, name, calling, group, gender });
                memberModal.style.display = 'none';
                showToast("Membro guardado!");

                // FORCE REFRESH
                await loadData();
                renderRoster(); // Explicitly re-render roster
            } catch (e) {
                showToast("Erro ao guardar: " + e.message, 'error');
            }
        });
    }





    // Bind File Upload in Modal
    document.getElementById('bulk-csv-upload')?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = async (evt) => {
                const text = evt.target.result;
                await parseAndImport(text);
            };
            reader.readAsText(file);
        }
    });

    // Close all menus on global click
    document.addEventListener('click', () => {
        document.querySelectorAll('.action-menu').forEach(el => el.style.display = 'none');
    });
});

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
        const rad = document.querySelector(`input[name="mem-gender"][value="${gender}"]`);
        if (rad) rad.checked = true;

        btnSave.dataset.id = member.id;
    } else {
        title.textContent = "Novo Membro";
        document.getElementById('mem-name').value = '';
        document.getElementById('mem-calling').value = '';
        document.getElementById('mem-group').value = 'Adult';
        const rad = document.querySelector('input[name="mem-gender"][value="M"]');
        if (rad) rad.checked = true;
        btnSave.dataset.id = '';
    }

    modal.style.display = 'flex';
}

function addMemberUI() { showMemberModal(); }

// Listeners
document.getElementById('roster-search')?.addEventListener('input', renderRoster);
document.getElementById('roster-filter')?.addEventListener('change', renderRoster);


// formatDate removed (duplicate)

// === Bulk Import Logic ===
function openBulkImport() {
    const modal = document.getElementById('bulk-import-modal');
    if (modal) modal.style.display = 'flex';

    // Reset Inputs
    const fMembers = document.getElementById('file-members');
    if (fMembers) fMembers.value = '';
    const fCallings = document.getElementById('file-callings');
    if (fCallings) fCallings.value = '';

    // Reset Preview Areas
    const previewBox = document.getElementById('import-preview-container');
    if (previewBox) previewBox.style.display = 'none';

    const actionBox = document.getElementById('import-actions');
    if (actionBox) actionBox.style.display = 'none';

    const tbody = document.getElementById('import-preview-tbody');
    if (tbody) tbody.innerHTML = '';
}

function downloadTemplate() {
    // Template for manual CSV - keeping just in case, but button might be gone
    const headers = ['Name', 'Calling', 'Group', 'Gender'];
    const rows = [
        ['Exemplo Nome', 'Bispo', 'Adult', 'M'],
        ['Maria Silva', 'Presidente Primaria', 'Adult', 'F'],
        ['Joao Santos', 'Sacerdote', 'Youth', 'M']
    ];

    let csvContent = "data:text/csv;charset=utf-8,"
        + headers.join(",") + "\n"
        + rows.map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "modelo_membros.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Stage 2 -> Final: Save
async function confirmImport() {
    const rows = document.querySelectorAll('#import-preview-tbody tr');
    if (rows.length === 0) return showToast("Nada para importar.", 'warning');

    let imported = 0;
    for (const tr of rows) {
        const name = tr.querySelector('.preview-name').value;
        const calling = tr.querySelector('.preview-calling').value;
        const group = tr.querySelector('.preview-group').value;
        const gender = tr.querySelector('.preview-gender').value;

        if (name) {
            await DM.saveMember({ id: null, name, calling, group, gender });
            imported++;
        }
    }

    showToast(`${imported} membros importados com sucesso!`, 'success');
    document.getElementById('bulk-import-modal').style.display = 'none';
    await loadData();
    renderRoster();
}

// === Event Bindings for Import ===
document.addEventListener('DOMContentLoaded', () => {
    // ... (existing bindings) ...
    document.getElementById('btn-open-import')?.addEventListener('click', openBulkImport);
    document.getElementById('btn-close-import-modal')?.addEventListener('click', () => {
        document.getElementById('bulk-import-modal').style.display = 'none';
    });

    document.getElementById('btn-cancel-import')?.addEventListener('click', () => {
        document.getElementById('bulk-import-modal').style.display = 'none';
    });

    document.getElementById('btn-confirm-import')?.addEventListener('click', confirmImport);

    // Import Table Delegation
    document.getElementById('import-preview-tbody')?.addEventListener('click', (e) => {
        if (e.target.closest('.ph-x')) {
            e.target.closest('tr').remove();
        }
    });

    // PDF Import Binding
    document.getElementById('btn-process-pdf')?.addEventListener('click', processPdfImport);

    // Remove members without callings from preview
    document.getElementById('btn-remove-no-calling')?.addEventListener('click', () => {
        const rows = document.querySelectorAll('#import-preview-tbody tr');
        let removed = 0;
        rows.forEach(tr => {
            const callingInput = tr.querySelector('.preview-calling');
            if (!callingInput || !callingInput.value.trim()) {
                tr.remove();
                removed++;
            }
        });
        showToast(`${removed} membros sem chamado removidos.`, 'success');
    });
});

// ==========================================
// === ROBUST SPATIAL PDF PARSER ===
// ==========================================

async function processPdfImport() {
    const fileMembers = document.getElementById('file-members').files[0];
    const fileCallings = document.getElementById('file-callings').files[0];

    if (!fileMembers) {
        return showToast("Por favor selecione pelo menos o ficheiro PDF da Lista de Membros.", 'warning');
    }

    const btn = document.getElementById('btn-process-pdf');
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i class="ph ph-spinner ph-spin"></i> Analisando PDF...`;
    btn.disabled = true;

    try {
        // 1. Parse Members (Spatial Reconstruction)
        const memberLines = await extractVisualLines(fileMembers);
        const membersData = parseMemberLines(memberLines);

        if (membersData.length === 0) {
            throw new Error("Não foi possível encontrar membros. O PDF pode estar num formato desconhecido.");
        }

        // Create a Map for matching callings later
        // Key: Normalized Name -> Value: Member Object
        const memberMap = new Map();
        membersData.forEach(m => memberMap.set(normalizeName(m.name), m));

        // 2. Parse Callings (Bidirectional Strategy via utility)
        if (fileCallings) {
            btn.innerHTML = `<i class="ph ph-spinner ph-spin"></i> Analisando Chamados...`;
            const callingLines = await extractVisualLines(fileCallings);
            parseCallingUpdates(callingLines, Array.from(memberMap.values()));
        }

        // 3. Render
        renderSmartPreview(Array.from(memberMap.values()));

    } catch (e) {
        console.error("PDF Error:", e);
        showToast("Erro ao processar PDF: " + e.message, 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// --- CORE PARSER FUNCTIONS ---

/**
 * Extracts text from PDF but PRESERVES table layout by
 * grouping items by Y-coordinate (Rows) and separating columns with gaps.
 */


// --- HELPERS ---



function renderSmartPreview(data) {
    const tbody = document.getElementById('import-preview-tbody');
    tbody.innerHTML = '';

    // Switch View
    document.getElementById('import-actions').style.display = 'flex';
    document.getElementById('import-preview-container').style.display = 'block';

    // Sort: members with callings first, then alphabetical by name
    data.sort((a, b) => {
        const aCalling = a.calling ? 1 : 0;
        const bCalling = b.calling ? 1 : 0;
        if (bCalling !== aCalling) return bCalling - aCalling;
        return a.name.localeCompare(b.name);
    });

    data.forEach(m => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #e2e8f0';

        tr.innerHTML = `
             <td style="padding:0.5rem; font-weight:500;">
                 <input type="text" value="${m.name}" class="preview-name" style="width:100%; border:none; background:transparent;">
             </td>
             <td style="padding:0.5rem; text-align:center;">
                 ${m.age}
             </td>
             <td style="padding:0.5rem;">
                 <select class="preview-group" style="padding:4px; border-radius:4px; border:1px solid #cbd5e1; width:100%;">
                     <option value="Adult" ${m.group === 'Adult' ? 'selected' : ''}>Adulto</option>
                     <option value="Young Adult" ${m.group === 'Young Adult' ? 'selected' : ''}>JA (18-35)</option>
                     <option value="Youth" ${m.group === 'Youth' ? 'selected' : ''}>Jovem (12-17)</option>
                     <option value="Primary" ${m.group === 'Primary' ? 'selected' : ''}>Primária (0-11)</option>
                 </select>
             </td>
             <td style="padding:0.5rem;">
                 <input type="text" value="${m.calling || ''}" class="preview-calling" placeholder="Chamado..." style="width:100%; border:1px solid #cbd5e1; border-radius:4px; padding:4px;">
                 <input type="hidden" class="preview-gender" value="${m.gender}">
             </td>
             <td style="padding:0.5rem; text-align:center;">
                 <i class="ph ph-x" style="cursor:pointer; color:red;" onclick="this.closest('tr').remove();"></i>
             </td>
         `;
        tbody.appendChild(tr);
    });
}


function formatDate(input) {
    if (!input) return '-';
    // Handle Firestore Timestamp
    if (typeof input.toDate === 'function') {
        return input.toDate().toLocaleDateString('pt-PT');
    }
    // Handle YYYY-MM-DD String
    if (typeof input === 'string' && input.includes('-') && input.length === 10) {
        const [year, month, day] = input.split('-');
        return `${day} -${month} -${year} `;
    }
    // Fallback
    return String(input);
}






// === VIEW: ADMIN ===
async function renderAdmin() {
    const tbody = document.getElementById('admin-users-tbody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:1rem;">Carregando utilizadores...</td></tr>';

    try {
        const users = await DM.getWardUsers();
        tbody.innerHTML = '';

        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhum utilizador encontrado.</td></tr>';
            return;
        }

        users.forEach(u => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${escapeHtml(u.name || 'Sem nome')}</td>
                <td>${escapeHtml(u.email)}</td>
                <td><span class="status-badge role-${escapeHtml(u.role)}">${escapeHtml(u.role)}</span></td>
                <td>${escapeHtml(u.status || 'active')}</td>
                <td>
                    ${u.role !== 'owner' ? `<button class="btn-sm" onclick="alert('Funcionalidade de gestão em breve')">Gerir</button>` : '-'}
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error(e);
        tbody.innerHTML = `<tr><td colspan="5" style="color:red; text-align:center;">Erro: ${escapeHtml(e.message)}</td></tr>`;
    }
}

// Expose functions for legacy HTML handlers and tests
window.addMemberUI = addMemberUI;
window.editPlan = editPlan;
window.switchEditorTab = switchEditorTab;
window.toggleMenu = toggleMenu;
window.viewMember = viewMember;
window.editMember = editMember;
window.deleteMember = deleteMember;
window.renderAdmin = renderAdmin;
window.setPlannerMode = setPlannerMode;
window.renderPlanSubTab = renderPlanSubTab;
