import {
    initUser, getWardSettings, saveWardSettings, finalizeMeeting, setAbsence, getAbsences, getHymnLastSung, approveMember, unregisterMember, saveFuturePlan, getWardUsers,
} from '../js/dataManager.js';
import { supabase, mockChain } from '../__mocks__/supabaseClient.js';

jest.mock('../js/api/supabase-client.js', () => require('../__mocks__/supabaseClient.js'));

async function withWard() {
    supabase.from.mockReturnValueOnce(mockChain({ data: { ward_id: 'ward-1', role: 'editor', status: 'active' }, error: null }));
    await initUser({ id: 'u1' });
}

describe('dataManager — Phase 3', () => {
    beforeEach(async () => { jest.clearAllMocks(); await withWard(); });

    test('getWardSettings returns defaults when no row exists', async () => {
        supabase.from.mockReturnValueOnce(mockChain({ data: null, error: null }));
        const s = await getWardSettings();
        expect(s).toMatchObject({ ward_id: 'ward-1', default_speakers: 3, absence_alert_after: 3, hymn_repeat_months: 3, conducting_rotation: [] });
    });

    test('saveWardSettings upserts by ward_id and strips ward_id/updated_at from input', async () => {
        const chain = mockChain({ data: null, error: null });
        supabase.from.mockReturnValueOnce(chain);
        await saveWardSettings({ ward_id: 'other', updated_at: 'x', presiding: 'Bispo', default_speakers: 4 });
        expect(supabase.from).toHaveBeenCalledWith('ward_settings');
        const [payload, opts] = chain.upsert.mock.calls[0];
        expect(payload).toMatchObject({ ward_id: 'ward-1', presiding: 'Bispo', default_speakers: 4 });
        expect(opts).toEqual({ onConflict: 'ward_id' });
    });

    test('finalizeMeeting calls the RPC with the confirmed program and attendance', async () => {
        supabase.rpc.mockResolvedValueOnce({ data: { date: '2026-09-14', status: 'completed' }, error: null });
        const program = [{ type: 'speaker', name: 'Ana', member_id: 'a' }];
        const result = await finalizeMeeting({ date: '2026-09-14', program, invocation_member_id: 'b', benediction_member_id: null, attendance: { total: 143 } });
        expect(supabase.rpc).toHaveBeenCalledWith('finalize_meeting', {
            p_ward_id: 'ward-1', p_date: '2026-09-14', p_program: program, p_invocation_member_id: 'b', p_benediction_member_id: null, p_attendance: { total: 143 },
        });
        expect(result.status).toBe('completed');
    });

    test('finalizeMeeting surfaces RPC errors in Portuguese', async () => {
        supabase.rpc.mockResolvedValueOnce({ data: null, error: { message: 'not authorized' } });
        await expect(finalizeMeeting({ date: '2026-09-14' })).rejects.toThrow('Erro ao terminar a reunião: not authorized');
    });

    test('setAbsence upserts when absent and deletes when present', async () => {
        const up = mockChain({ data: null, error: null });
        supabase.from.mockReturnValueOnce(up);
        await setAbsence('2026-09-14', 'm1', true);
        expect(up.upsert).toHaveBeenCalledWith({ ward_id: 'ward-1', meeting_date: '2026-09-14', member_id: 'm1' }, { onConflict: 'ward_id,meeting_date,member_id', ignoreDuplicates: true });

        const del = mockChain({ data: null, error: null });
        supabase.from.mockReturnValueOnce(del);
        await setAbsence('2026-09-14', 'm1', false);
        expect(del.delete).toHaveBeenCalled();
        expect(del.eq).toHaveBeenCalledWith('member_id', 'm1');
    });

    test('getAbsences returns a Set of member ids', async () => {
        supabase.from.mockReturnValueOnce(mockChain({ data: [{ member_id: 'a' }, { member_id: 'b' }], error: null }));
        const s = await getAbsences('2026-09-14');
        expect(s).toEqual(new Set(['a', 'b']));
    });

    test('getHymnLastSung keeps the most recent date per hymn number', async () => {
        supabase.from.mockReturnValueOnce(mockChain({
            data: [{ hymn_number: '112 - Sim', date: '2026-09-07' }, { hymn_number: '112 - Sim', date: '2026-06-01' }, { hymn_number: '6', date: '2026-08-01' }],
            error: null,
        }));
        const map = await getHymnLastSung();
        expect(map.get('112')).toBe('2026-09-07');
        expect(map.get('6')).toBe('2026-08-01');
    });

    test('approveMember calls the RPC with ward, user and role', async () => {
        supabase.rpc.mockResolvedValueOnce({ data: { role: 'editor' }, error: null });
        await approveMember('u2', 'editor');
        expect(supabase.rpc).toHaveBeenCalledWith('approve_member', { p_ward_id: 'ward-1', p_user_id: 'u2', p_role: 'editor' });
    });

    test('unregisterMember calls the RPC and surfaces its error', async () => {
        supabase.rpc.mockResolvedValueOnce({ data: null, error: null });
        await unregisterMember('m1');
        expect(supabase.rpc).toHaveBeenCalledWith('unregister_member', { p_member_id: 'm1' });
        supabase.rpc.mockResolvedValueOnce({ data: null, error: { message: 'not allowed' } });
        await expect(unregisterMember('m1')).rejects.toEqual({ message: 'not allowed' });
    });

    test('saveFuturePlan keeps a completed meeting completed and saves others as draft', async () => {
        const chain = mockChain();
        supabase.from.mockReturnValue(chain);
        await saveFuturePlan({ date: '2025-06-01', status: 'completed', program: [] });
        expect(chain.upsert.mock.calls[0][0].status).toBe('completed');
        await saveFuturePlan({ date: '2026-10-11', program: [] });
        expect(chain.upsert.mock.calls[1][0].status).toBe('draft');
    });

    test('getWardUsers reads accesses through the ward_access RPC', async () => {
        supabase.rpc.mockResolvedValueOnce({ data: [{ user_id: 'u1', email: 'a@b.pt', role: 'owner' }], error: null });
        const rows = await getWardUsers();
        expect(supabase.rpc).toHaveBeenCalledWith('ward_access', { p_ward_id: 'ward-1' });
        expect(rows[0].email).toBe('a@b.pt');
    });
});
