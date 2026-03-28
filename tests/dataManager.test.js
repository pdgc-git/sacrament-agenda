import { initUser, createWard } from '../js/dataManager.js';
import * as firestore from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js';

// Mock Firebase Config
jest.mock('../js/firebase-config.js', () => ({
    db: {},
    auth: { currentUser: { uid: 'test-uid', email: 'test@example.com' } }
}));

describe('DataManager', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('initUser should return hasWard: false if user has no ward', async () => {
        firestore.getDoc.mockResolvedValue({
            exists: () => true,
            data: () => ({ wardId: null })
        });

        const result = await initUser({ uid: 'test-uid' });
        expect(result).toEqual({ hasWard: false });
    });

    test('initUser should return ward info if user has ward', async () => {
        firestore.getDoc
            .mockResolvedValueOnce({ // users/uid
                exists: () => true,
                data: () => ({ wardId: 'ward-123' })
            })
            .mockResolvedValueOnce({ // wards/users/uid
                exists: () => true,
                data: () => ({ role: 'editor', status: 'active' })
            });

        const result = await initUser({ uid: 'test-uid' });
        expect(result).toEqual({ hasWard: true, wardId: 'ward-123', role: 'editor', status: 'active' });
    });

    test('createWard should create ward and update user profile', async () => {
        firestore.addDoc.mockResolvedValue({ id: 'new-ward-id' });

        const wardId = await createWard('Test Ward');

        expect(wardId).toBe('new-ward-id');
        expect(firestore.addDoc).toHaveBeenCalled(); // Ward creation
        expect(firestore.setDoc).toHaveBeenCalledTimes(2); // Member add + Profile update
    });

    // Tests for saveMember validation
    describe('saveMember validation', () => {
        let dm;
        beforeEach(async () => {
            dm = await import('../js/dataManager.js');
            // Mock getWardId by initializing user
            firestore.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ wardId: 'ward-123' }) });
            await dm.initUser({ uid: 'test' });
        });

        test('saveMember should throw if name is missing or empty', async () => {
            await expect(dm.saveMember({})).rejects.toThrow("O nome do membro é obrigatório.");
            await expect(dm.saveMember({ name: '' })).rejects.toThrow("O nome do membro é obrigatório.");
            await expect(dm.saveMember({ name: '   ' })).rejects.toThrow("O nome do membro é obrigatório.");
            await expect(dm.saveMember({ name: null })).rejects.toThrow("O nome do membro é obrigatório.");
            await expect(dm.saveMember({ name: 123 })).rejects.toThrow("O nome do membro é obrigatório.");
        });

        test('saveMember should default group to Adult if not provided', async () => {
            firestore.addDoc.mockResolvedValue({ id: 'new-member-id' });

            const memberData = { name: 'Test Member' };
            await dm.saveMember(memberData);

            expect(memberData.group).toBe('Adult');
            expect(firestore.addDoc).toHaveBeenCalled();
        });

        test('saveMember should throw if group is invalid', async () => {
            const memberData = { name: 'Test Member', group: 'InvalidGroup' };
            await expect(dm.saveMember(memberData)).rejects.toThrow("Grupo inválido. Deve ser um de: Adult, Youth, Primary, Young Adult");
        });
    });

    // Tests for importMembersFromCSV
    test('importMembersFromCSV should handle empty file gracefully', async () => {
        const file = {
            text: jest.fn().mockResolvedValue('')
        };
        const dm = await import('../js/dataManager.js');
        // We need to mock getWardId usage inside dataManager if strictly parsing. 
        // But getWardId throws if currentWardId is null.
        // We must ensure currentWardId is set or getWardId is mocked/bypassed.
        // dataManager exports getWardId? No. It's internal.
        // However, we can trick it by calling initUser with a robust mock or just rely on global state if we could set it.
        // Actually, initUser sets global currentWardId.

        // Setup state
        firestore.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ wardId: 'ward-123' }) });
        await dm.initUser({ uid: 'test' });
        // Now calling import should work

        const count = await dm.importMembersFromCSV(file);
        expect(count).toBe(0);
    });

    test('importMembersFromCSV should handle file with only headers', async () => {
        const file = {
            text: jest.fn().mockResolvedValue('Name,Gender,Group')
        };
        const dm = await import('../js/dataManager.js');
        // State should persist from previous test if using same module instance, 
        // but let's be safe and re-init if needed or just assume it works if order is preserved.

        const count = await dm.importMembersFromCSV(file);
        expect(count).toBe(0);
    });
});
