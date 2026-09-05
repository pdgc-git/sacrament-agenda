import { initUser, createWard, getMemberStats } from '../js/dataManager.js';
import { supabase, mockChain } from '../__mocks__/supabaseClient.js';

jest.mock('../js/api/supabase-client.js', () => require('../__mocks__/supabaseClient.js'));

describe('DataManager', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('initUser should return hasWard: false if user has no ward', async () => {
        supabase.from.mockReturnValueOnce(mockChain({ data: null, error: null }));

        const result = await initUser({ id: 'test-uid' });
        expect(result).toEqual({ hasWard: false });
    });

    test('initUser should handle query errors gracefully', async () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        supabase.from.mockReturnValueOnce(mockChain({ data: null, error: new Error('permission-denied') }));

        const result = await initUser({ id: 'test-uid' });
        expect(result).toEqual({ hasWard: false, error: 'permission-denied' });

        consoleSpy.mockRestore();
    });

    test('initUser should return ward info if user has ward', async () => {
        supabase.from.mockReturnValueOnce(mockChain({
            data: { ward_id: 'ward-123', role: 'editor', status: 'active' },
            error: null,
        }));

        const result = await initUser({ id: 'test-uid' });
        expect(result).toEqual({ hasWard: true, wardId: 'ward-123', role: 'editor', status: 'active' });
    });

    test('createWard should create ward via RPC and return its id', async () => {
        supabase.rpc.mockResolvedValueOnce({
            data: { id: 'new-ward-id', name: 'Test Ward', owner_id: 'test-uid' },
            error: null,
        });

        const wardId = await createWard('Test Ward');

        expect(wardId).toBe('new-ward-id');
        expect(supabase.rpc).toHaveBeenCalledWith('create_ward', { p_name: 'Test Ward' });
    });

    // Tests for saveMember validation
    describe('saveMember validation', () => {
        let dm;
        beforeEach(async () => {
            dm = await import('../js/dataManager.js');
            supabase.from.mockReturnValueOnce(mockChain({
                data: { ward_id: 'ward-123', role: 'editor', status: 'active' },
                error: null,
            }));
            await dm.initUser({ id: 'test' });
        });

        test('saveMember should throw if name is missing or empty', async () => {
            await expect(dm.saveMember({})).rejects.toThrow("O nome do membro é obrigatório.");
            await expect(dm.saveMember({ name: '' })).rejects.toThrow("O nome do membro é obrigatório.");
            await expect(dm.saveMember({ name: '   ' })).rejects.toThrow("O nome do membro é obrigatório.");
            await expect(dm.saveMember({ name: null })).rejects.toThrow("O nome do membro é obrigatório.");
            await expect(dm.saveMember({ name: 123 })).rejects.toThrow("O nome do membro é obrigatório.");
        });

        test('saveMember should default group to Adult if not provided', async () => {
            supabase.from.mockReturnValueOnce(mockChain({ data: { id: 'new-member-id' }, error: null }));

            const memberData = { name: 'Test Member' };
            await dm.saveMember(memberData);

            expect(memberData.group).toBe('Adult');
            expect(supabase.from).toHaveBeenCalledWith('members');
        });

        test('saveMember should throw if group is invalid', async () => {
            const memberData = { name: 'Test Member', group: 'InvalidGroup' };
            await expect(dm.saveMember(memberData)).rejects.toThrow("Grupo inválido. Deve ser um de: Adult, Youth, Primary, Young Adult");
        });
    });

    describe('getMemberStats', () => {
        beforeEach(async () => {
            // Reset currentWardId by calling initUser(null)
            await initUser(null);
        });

        test('should return member data when the member document exists', async () => {
            const mockMemberData = { id: 'member-456', name: 'John Doe', group: 'Adult' };

            supabase.from.mockReturnValueOnce(mockChain({
                data: { ward_id: 'ward-123', role: 'editor', status: 'active' },
                error: null,
            }));
            await initUser({ id: 'test-uid' });

            supabase.from.mockReturnValueOnce(mockChain({ data: mockMemberData, error: null }));

            const stats = await getMemberStats('member-456');

            expect(stats).toEqual(mockMemberData);
        });

        test('should return null when the member document does not exist', async () => {
            supabase.from.mockReturnValueOnce(mockChain({
                data: { ward_id: 'ward-123', role: 'editor', status: 'active' },
                error: null,
            }));
            await initUser({ id: 'test-uid' });

            supabase.from.mockReturnValueOnce(mockChain({ data: null, error: null }));

            const stats = await getMemberStats('non-existent');

            expect(stats).toBeNull();
        });

        test('should throw error when no ward is selected', async () => {
            // currentWardId is reset in the nested beforeEach by calling initUser(null)
            await expect(getMemberStats('member-456'))
                .rejects.toThrow("Nenhuma ala selecionada. Crie ou junte-se a uma ala.");
        });
    });
});
