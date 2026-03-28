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

    describe('saveMeeting', () => {
        let dm;
        let mockBatch;

        beforeEach(async () => {
            dm = await import('../js/dataManager.js');
            // Mock Timestamp
            firestore.Timestamp.fromDate = jest.fn().mockImplementation((date) => `MockTimestamp(${date.toISOString()})`);

            // Mock batch object
            mockBatch = {
                set: jest.fn(),
                update: jest.fn(),
                commit: jest.fn().mockResolvedValue()
            };
            firestore.writeBatch.mockReturnValue(mockBatch);

            // Setup state
            firestore.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ wardId: 'ward-123' }) });
            await dm.initUser({ uid: 'test' });
        });

        afterEach(async () => {
            // Reset currentWardId to avoid state leaking to other test suites
            await dm.initUser(null);
        });

        test('should save meeting and update member stats correctly', async () => {
            const meetingData = {
                date: '2023-10-22',
                presiding: 'Bishop Smith',
                conducting: 'Brother Jones',
                hymns: ['1', '2', '3'],
                speakers: [
                    { name: 'John Doe', memberId: 'member-1', topic: 'Faith' },
                    { name: 'Jane Doe', memberId: null, topic: 'Hope' } // No memberId
                ],
                invocationMemberId: 'member-2',
                benedictionMemberId: 'member-3',
                attendance: 150
            };

            const result = await dm.saveMeeting(meetingData);

            expect(result).toBe('2023-10-22');
            expect(firestore.writeBatch).toHaveBeenCalledWith({});

            // doc returns something like an object in actual firestore, but our jest mock might be returning undefined if we don't handle it
            // So let's just check the arguments passed to mockBatch.set

            // We should check that mockBatch.set was called 1 time
            expect(mockBatch.set).toHaveBeenCalledTimes(1);

            // Check if date was converted to timestamp
            const setCallArgs = mockBatch.set.mock.calls[0][1];
            expect(setCallArgs.date).toContain('MockTimestamp(2023-10-22');
            expect(setCallArgs.status).toBe('completed');
            expect(setCallArgs.presiding).toBe('Bishop Smith');
            expect(setCallArgs.hymns).toEqual(['1', '2', '3']);
            expect(setCallArgs.speakers).toEqual([
                { name: 'John Doe', memberId: 'member-1', topic: 'Faith' },
                { name: 'Jane Doe', memberId: null, topic: 'Hope' }
            ]);
            expect(setCallArgs.invocationMemberId).toBe('member-2');
            expect(setCallArgs.benedictionMemberId).toBe('member-3');
            expect(setCallArgs.attendance).toBe(150);

            // Check member stats updates
            // Should be exactly 3 updates: 1 speaker, 1 invocation, 1 benediction
            expect(mockBatch.update).toHaveBeenCalledTimes(3);

            // Ensure commit was called
            expect(mockBatch.commit).toHaveBeenCalledTimes(1);
        });

        test('should save meeting correctly without updating missing member stats', async () => {
            const meetingData = {
                date: '2023-10-29',
                presiding: 'Bishop Smith',
                conducting: 'Brother Jones',
                hymns: ['1', '2', '3'],
                speakers: [
                    { name: 'Visitor' } // No memberId
                ],
                // No invocation/benediction members
                attendance: 120
            };

            await dm.saveMeeting(meetingData);

            expect(mockBatch.set).toHaveBeenCalledTimes(1);
            expect(mockBatch.update).not.toHaveBeenCalled(); // No members to update
            expect(mockBatch.commit).toHaveBeenCalledTimes(1);
        });
    });
});
