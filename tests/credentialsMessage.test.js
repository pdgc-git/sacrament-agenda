/**
 * @jest-environment jsdom
 */
jest.mock('../js/dataManager.js', () => ({}));
jest.mock('../js/app-state.js', () => ({ state: { ward: { name: 'Ala Benfica' } }, canAdmin: () => true, reloadSettings: jest.fn() }));
jest.mock('../js/components/Toast.js', () => ({ showToast: jest.fn() }));
jest.mock('../js/utils/theme.js', () => ({ setTheme: jest.fn() }));

import { credentialsMessage } from '../js/views/admin.js';

describe('credentialsMessage', () => {
    const url = 'https://agenda.example/planner.html';
    test('new login: link, e-mail, temporary password and what happens next', () => {
        const msg = credentialsMessage({ name: 'Ana', email: 'ana@mail.pt', password: 'Agenda-abcd-efgh', created: true }, url, 'Ala Benfica');
        expect(msg).toContain('Olá, Ana. Já tem acesso à Agenda Sacramental da Ala Benfica.');
        expect(msg).toContain(`Entre em: ${url}`);
        expect(msg).toContain('Palavra-passe temporária: Agenda-abcd-efgh');
        expect(msg).toContain('Na primeira entrada vai escolher a sua palavra-passe.');
    });
    test('existing login: no password in the message', () => {
        const msg = credentialsMessage({ name: 'Rui', email: 'rui@mail.pt', password: null }, url, 'Ala Benfica');
        expect(msg).not.toContain('temporária');
        expect(msg).toContain('Use a palavra-passe que já tem.');
    });
});
