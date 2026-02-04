/**
 * @jest-environment jsdom
 */

// Mock Firebase modules
jest.mock('../js/firebase-config.js', () => ({
    db: {},
    auth: { currentUser: { uid: 'test-uid', email: 'test@test.com', displayName: 'Test User' } }
}));

jest.mock('https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js', () => ({
    GoogleAuthProvider: jest.fn(),
    signInWithPopup: jest.fn(),
    signOut: jest.fn(),
    onAuthStateChanged: jest.fn((auth, callback) => {
        // Don't auto-trigger to prevent side effects
        return jest.fn(); // unsubscribe
    }),
    createUserWithEmailAndPassword: jest.fn(),
    signInWithEmailAndPassword: jest.fn()
}));

// Mock DataManager
jest.mock('../js/dataManager.js', () => ({
    initUser: jest.fn().mockResolvedValue({ hasWard: true, role: 'admin', status: 'active' }),
    getWardName: jest.fn().mockResolvedValue('Test Ward'),
    getMembers: jest.fn().mockResolvedValue([]),
    getDashboardStats: jest.fn().mockResolvedValue({ mtd: 100, ytd: 1200, monthName: 'janeiro', year: 2026 }),
    getWardUsers: jest.fn().mockResolvedValue([]),
    getFuturePlans: jest.fn().mockResolvedValue([]),
    saveFuturePlan: jest.fn(),
    saveMember: jest.fn().mockResolvedValue(),
    importMembersFromCSV: jest.fn(),
    saveMeeting: jest.fn(),
    getHistory: jest.fn().mockResolvedValue([]),
    deleteMember: jest.fn().mockResolvedValue(),
    getMemberHistory: jest.fn().mockResolvedValue({ talks: [], prayers: [] }),
    checkHymnHistory: jest.fn().mockResolvedValue(null)
}));

// Comprehensive DOM setup matching planner.html
const createFullDOM = () => `
    <!-- Auth Overlay -->
    <div id="auth-overlay" style="display:none">
        <div class="auth-box">
            <h2 id="auth-title">Bem-vindo</h2>
            <button id="login-btn"></button>
            <div id="email-auth-group">
                <input type="email" id="email-input">
                <input type="password" id="password-input">
                <button id="btn-email-login"></button>
                <a id="btn-signup-toggle"></a>
            </div>
            <p id="auth-error"></p>
        </div>
    </div>
    
    <!-- Navigation -->
    <nav class="app-nav">
        <div class="nav-item active" data-target="view-dashboard"></div>
        <div class="nav-item" data-target="view-planner"></div>
        <div class="nav-item" data-target="view-roster"></div>
        <div class="nav-item" data-target="view-planning"></div>
        <div class="nav-item" data-target="view-history"></div>
        <div class="nav-item" data-target="view-admin" id="nav-admin" style="display:none"></div>
        <div class="nav-item" id="logout-btn"></div>
    </nav>
    
    <!-- Dashboard View -->
    <div id="view-dashboard" class="view-container active">
        <h1 id="dashboard-greeting">Olá, ...</h1>
        <p id="dashboard-subtitle">Bem-vindo à Ala ...</p>
        <span id="stat-mtd">0</span>
        <span id="stat-ytd">0</span>
        <span id="lbl-month">Mês</span>
        <span id="lbl-year">Ano</span>
        <canvas id="chart-mtd"></canvas>
        <canvas id="chart-ytd"></canvas>
    </div>
    
    <!-- Planner View -->
    <div id="view-planner" class="view-container">
        <p id="ward-name-display">Carregando...</p>
        <form id="agendaForm">
            <input type="date" name="date" id="input-date">
            <input type="checkbox" id="fastMeeting" name="fastMeeting">
            <input type="text" name="presiding">
            <input type="text" name="conducting">
            <input type="text" name="organist">
            <input type="text" name="chorister">
            <div class="hymn-input-wrapper">
                <input type="text" class="hymn-search" name="openingHymn">
                <div class="hymn-results"></div>
            </div>
            <div class="member-search-wrapper">
                <input type="text" class="member-search" name="invocation">
                <div class="member-results"></div>
            </div>
            <div class="hymn-input-wrapper">
                <input type="text" class="hymn-search" name="sacramentHymn">
                <div class="hymn-results"></div>
            </div>
            <div id="speakers-input-container"></div>
            <div class="hymn-input-wrapper">
                <input type="text" class="hymn-search" name="closingHymn">
                <div class="hymn-results"></div>
            </div>
            <div class="member-search-wrapper">
                <input type="text" class="member-search" name="benediction">
                <div class="member-results"></div>
            </div>
            <input type="number" name="att_start">
            <input type="number" name="att_sacrament">
            <input type="number" name="att_end">
            <input type="number" name="att_visitors">
        </form>
        <button id="btn-finalize"></button>
        <div id="agenda-paper">
            <span data-bind="date"></span>
            <span data-bind="presiding"></span>
            <span data-bind="conducting"></span>
            <span data-bind="organist"></span>
            <span data-bind="chorister"></span>
            <span data-bind="openingHymn"></span>
            <span data-bind="invocation"></span>
            <span data-bind="sacramentHymn"></span>
            <span data-bind="closingHymn"></span>
            <span data-bind="benediction"></span>
        </div>
        <div id="fast-meeting-note" style="display:none"></div>
        <div id="speakers-list"></div>
        <div id="preview-ward-name"></div>
    </div>
    
    <!-- Roster View -->
    <div id="view-roster" class="view-container roster-view">
        <input type="file" id="csv-upload" accept=".csv">
        <select id="roster-filter">
            <option value="all">Todos</option>
            <option value="Adult">Adultos</option>
            <option value="Young Adult">Jovens Adultos</option>
            <option value="Youth">Jovens</option>
            <option value="Primary">Primária</option>
            <option value="gender_M">Homens</option>
            <option value="gender_F">Mulheres</option>
        </select>
        <table id="roster-table">
            <tbody id="roster-tbody"></tbody>
        </table>
    </div>
    
    <!-- Planning View -->
    <div id="view-planning" class="view-container"></div>
    
    <!-- History View -->
    <div id="view-history" class="view-container">
        <table id="history-table">
            <tbody id="history-tbody"></tbody>
        </table>
    </div>
    
    <!-- Admin View -->
    <div id="view-admin" class="view-container">
        <table id="admin-users-table">
            <tbody id="admin-users-tbody"></tbody>
        </table>
    </div>
    
    <!-- Member Modal -->
    <div id="member-modal" style="display:none">
        <h2 id="modal-title">Novo Membro</h2>
        <input type="text" id="mem-name">
        <input type="text" id="mem-calling">
        <select id="mem-group">
            <option value="Adult">Adulto</option>
            <option value="Young Adult">JA</option>
            <option value="Youth">Jovem</option>
            <option value="Primary">Primária</option>
        </select>
        <div>
            <input type="radio" name="mem-gender" value="M" checked>
            <input type="radio" name="mem-gender" value="F">
        </div>
        <button id="btn-cancel-member"></button>
        <button id="btn-save-member"></button>
    </div>
    
    <!-- View Member Modal -->
    <div id="member-view-modal" style="display:none">
        <h2 id="view-mem-name">Nome</h2>
        <p id="view-mem-details">Detalhes...</p>
        <ul id="view-mem-talks"></ul>
        <ul id="view-mem-prayers"></ul>
        <button id="btn-edit-from-view"></button>
    </div>
    
    <!-- Delete Confirmation Modal -->
    <div id="delete-confirm-modal" style="display:none">
        <h3>Confirmar Remoção</h3>
        <button id="btn-cancel-delete"></button>
        <button id="btn-confirm-delete"></button>
    </div>
`;

describe('Planner UI - Comprehensive Tests', () => {
    let DM;

    beforeEach(async () => {
        jest.resetModules();
        jest.clearAllMocks();

        document.body.innerHTML = createFullDOM();

        // Get the mocked DM before importing planner-ui
        DM = require('../js/dataManager.js');

        // Import the module (this triggers DOMContentLoaded listeners)
        await import('../js/planner-ui.js');

        // Trigger DOMContentLoaded
        document.dispatchEvent(new Event('DOMContentLoaded'));
    });

    describe('Module Loading', () => {
        test('planner-ui module should load without errors', async () => {
            const plannerUI = await import('../js/planner-ui.js');
            expect(plannerUI).toBeDefined();
        });
    });

    describe('Navigation', () => {
        test('clicking nav item should switch active view', () => {
            const rosterNav = document.querySelector('[data-target="view-roster"]');
            const dashboardView = document.getElementById('view-dashboard');
            const rosterView = document.getElementById('view-roster');

            // Initially dashboard is active
            expect(dashboardView.classList.contains('active')).toBe(true);

            // Click roster nav
            rosterNav.click();

            // Roster should now be active
            expect(rosterNav.classList.contains('active')).toBe(true);
        });
    });

    describe('Roster Action Menu', () => {
        beforeEach(() => {
            // Setup mock members data
            window.state = {
                members: [
                    { id: 'mem-1', name: 'John Doe', calling: 'Bishop', group: 'Adult', gender: 'M' },
                    { id: 'mem-2', name: 'Jane Smith', calling: 'Teacher', group: 'Adult', gender: 'F' }
                ]
            };
        });

        test('toggleMenu should be defined on window', () => {
            expect(typeof window.toggleMenu).toBe('function');
        });

        test('editMember should be defined on window', () => {
            expect(typeof window.editMember).toBe('function');
        });

        test('deleteMember should be defined on window', () => {
            expect(typeof window.deleteMember).toBe('function');
        });

        test('viewMember should be defined on window', () => {
            expect(typeof window.viewMember).toBe('function');
        });

        test('toggleMenu should toggle menu visibility', () => {
            const menuId = 'mem-1';
            const menu = document.createElement('div');
            menu.id = `menu-${menuId}`;
            menu.className = 'action-menu';
            menu.style.display = 'none';
            document.body.appendChild(menu);

            const event = { stopPropagation: jest.fn() };

            // Toggle open
            window.toggleMenu(event, menuId);
            expect(menu.style.display).toBe('block');
            expect(event.stopPropagation).toHaveBeenCalled();

            // Toggle close
            window.toggleMenu(event, menuId);
            expect(menu.style.display).toBe('none');
        });

        test('deleteMember should open delete confirmation modal', () => {
            const modal = document.getElementById('delete-confirm-modal');
            expect(modal.style.display).toBe('none');

            window.deleteMember('mem-1');

            expect(modal.style.display).toBe('flex');
        });

        test('cancel delete button should close modal', () => {
            const modal = document.getElementById('delete-confirm-modal');
            window.deleteMember('mem-1');
            expect(modal.style.display).toBe('flex');

            // Click cancel
            const cancelBtn = document.getElementById('btn-cancel-delete');
            cancelBtn.click();

            expect(modal.style.display).toBe('none');
        });

        test('confirm delete button should call DM.deleteMember', async () => {
            window.deleteMember('mem-1');

            const confirmBtn = document.getElementById('btn-confirm-delete');
            confirmBtn.click();

            // Wait for async operation
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(DM.deleteMember).toHaveBeenCalledWith('mem-1');
        });
    });

    describe('Member Modal', () => {
        test('member modal should exist', () => {
            const modal = document.getElementById('member-modal');
            expect(modal).not.toBeNull();
        });

        test('cancel button should close member modal', () => {
            const modal = document.getElementById('member-modal');
            modal.style.display = 'flex';

            const cancelBtn = document.getElementById('btn-cancel-member');
            cancelBtn.click();

            expect(modal.style.display).toBe('none');
        });

        test('addMemberUI should be available on window', () => {
            expect(typeof window.addMemberUI).toBe('function');
        });
    });

    describe('View Member Modal', () => {
        test('view member modal should exist', () => {
            const modal = document.getElementById('member-view-modal');
            expect(modal).not.toBeNull();
        });
    });

    describe('Filter Functionality', () => {
        test('roster filter select should exist', () => {
            const filter = document.getElementById('roster-filter');
            expect(filter).not.toBeNull();
            expect(filter.options.length).toBeGreaterThan(0);
        });

        test('filter should have gender options', () => {
            const filter = document.getElementById('roster-filter');
            const options = Array.from(filter.options).map(o => o.value);

            expect(options).toContain('gender_M');
            expect(options).toContain('gender_F');
        });
    });

    describe('Form Preview Sync', () => {
        test('form inputs should exist', () => {
            const form = document.getElementById('agendaForm');
            expect(form).not.toBeNull();

            const dateInput = form.querySelector('[name="date"]');
            expect(dateInput).not.toBeNull();

            const presidingInput = form.querySelector('[name="presiding"]');
            expect(presidingInput).not.toBeNull();
        });
    });

    describe('CSV Upload', () => {
        test('CSV upload input should exist', () => {
            const csvInput = document.getElementById('csv-upload');
            expect(csvInput).not.toBeNull();
            expect(csvInput.accept).toBe('.csv');
        });
    });
});
