import { initUser, createWard, updateUserRole } from '../js/dataManager.js';
import * as firestore from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js';

// Mock Firebase Config
jest.mock('../js/firebase-config.js', () => ({
    db: {},
    auth: { currentUser: { uid: 'test-uid', email: 'test@example.com' } }
}));

describe('DataManager', () => {
    beforeEach(async () => {
        jest.clearAllMocks();
        // Reset the currentWardId by calling initUser with null
        await initUser(null);
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

    describe('updateUserRole', () => {
        beforeEach(async () => {
            // Re-import or force reset by doing initUser without ward to ensure currentWardId is null
            firestore.getDoc.mockResolvedValue({
                exists: () => true,
                data: () => ({ wardId: null })
            });
            await initUser({ uid: 'reset-uid' });
        });

        test('should throw error if no ward is selected', async () => {
            let error;
            try {
                await updateUserRole('target-123', 'admin', 'active');
            } catch (e) {
                error = e;
            }
            expect(error).toBeDefined();
            expect(error.message).toBe("Nenhuma ala selecionada. Crie ou junte-se a uma ala.");
        });

        test('should successfully update user role in batch', async () => {
            // Setup a selected ward
            firestore.getDoc
                .mockResolvedValueOnce({ // users/uid
                    exists: () => true,
                    data: () => ({ wardId: 'ward-123' })
                })
                .mockResolvedValueOnce({ // wards/users/uid
                    exists: () => true,
                    data: () => ({ role: 'owner', status: 'active' })
                });

            await initUser({ uid: 'owner-uid' });

            // Spy on writeBatch instance methods returned by our mock
            const mockBatch = {
                update: jest.fn(),
                commit: jest.fn().mockResolvedValue()
            };
            firestore.writeBatch.mockReturnValue(mockBatch);

            await updateUserRole('target-123', 'editor', 'active');

            expect(firestore.writeBatch).toHaveBeenCalledWith(expect.anything());

            // Should call batch.update twice
            expect(mockBatch.update).toHaveBeenCalledTimes(2);

            // Update 1: Ward membership
            expect(firestore.doc).toHaveBeenCalledWith(expect.anything(), 'wards/ward-123/users', 'target-123');
            expect(mockBatch.update).toHaveBeenNthCalledWith(1,
                expect.objectContaining({ type: 'doc', args: [expect.anything(), 'wards/ward-123/users', 'target-123'] }),
                { role: 'editor', status: 'active' }
            );

            // Update 2: Global User Profile
            expect(firestore.doc).toHaveBeenCalledWith(expect.anything(), 'users', 'target-123');
            expect(mockBatch.update).toHaveBeenNthCalledWith(2,
                expect.objectContaining({ type: 'doc', args: [expect.anything(), 'users', 'target-123'] }),
                { role: 'editor' }
            );

            // Commit the batch
            expect(mockBatch.commit).toHaveBeenCalled();
        });
    });
});
