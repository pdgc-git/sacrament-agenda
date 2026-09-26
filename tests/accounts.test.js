/**
 * @jest-environment jsdom
 */
import { initUser, createAccount, resetAccountPassword } from '../js/dataManager.js';
import { supabase, mockChain } from '../__mocks__/supabaseClient.js';

jest.mock('../js/api/supabase-client.js', () => require('../__mocks__/supabaseClient.js'));

describe('accounts service calls', () => {
    beforeAll(async () => {
        supabase.from.mockReturnValueOnce(mockChain({ data: { ward_id: 'ward-1', role: 'owner', status: 'active' }, error: null }));
        await initUser({ id: 'u1' });
    });
    beforeEach(() => {
        supabase.auth = { getSession: jest.fn(() => Promise.resolve({ data: { session: { access_token: 'tok' } } })) };
    });

    test('createAccount posts with the caller token and the ward', async () => {
        global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ user_id: 'n1', email: 'a@b.pt', created: true, password: 'Agenda-abcd-efgh' }) }));
        const out = await createAccount({ name: 'Ana', email: 'a@b.pt', role: 'music' });
        const [url, opts] = global.fetch.mock.calls[0];
        expect(url).toBe('/api/accounts');
        expect(opts.headers.Authorization).toBe('Bearer tok');
        expect(JSON.parse(opts.body)).toEqual({ ward_id: 'ward-1', name: 'Ana', email: 'a@b.pt', role: 'music' });
        expect(out.password).toBe('Agenda-abcd-efgh');
    });

    test('errors carry the service message', async () => {
        global.fetch = jest.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({ message: 'Só o bispado pode gerir contas.' }) }));
        await expect(resetAccountPassword('x')).rejects.toThrow('Só o bispado pode gerir contas.');
    });

    test('no session, no call', async () => {
        supabase.auth.getSession = jest.fn(() => Promise.resolve({ data: { session: null } }));
        global.fetch = jest.fn();
        await expect(createAccount({ name: 'A', email: 'a@b.pt', role: 'viewer' })).rejects.toThrow('Sessão expirada');
        expect(global.fetch).not.toHaveBeenCalled();
    });
});
