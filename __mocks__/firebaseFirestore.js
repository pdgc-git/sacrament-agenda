// Mock Firebase SDK (Firestore, Auth, App, Analytics)
module.exports = {
    // App
    initializeApp: jest.fn(() => ({})),

    // Analytics
    getAnalytics: jest.fn(() => ({})),

    // Auth
    getAuth: jest.fn(() => ({
        currentUser: { uid: 'test-uid', email: 'test@example.com' },
        onAuthStateChanged: jest.fn()
    })),
    connectAuthEmulator: jest.fn(),

    // Firestore
    getFirestore: jest.fn(() => ({})),
    connectFirestoreEmulator: jest.fn(),
    collection: jest.fn((db, path) => ({ type: 'collection', path })),
    doc: jest.fn((...args) => ({ type: 'doc', args })),
    getDocs: jest.fn(),
    getDoc: jest.fn(),
    setDoc: jest.fn(),
    addDoc: jest.fn(() => Promise.resolve({ id: 'mock-doc-id' })),
    deleteDoc: jest.fn(),
    updateDoc: jest.fn(),
    query: jest.fn(),
    where: jest.fn(),
    orderBy: jest.fn(),
    limit: jest.fn(),
    writeBatch: jest.fn().mockImplementation(() => {
        const batch = {
            set: jest.fn(),
            update: jest.fn(),
            commit: jest.fn().mockResolvedValue()
        };
        return batch;
    }),
    Timestamp: {
        now: jest.fn(() => ({ toDate: () => new Date(), toMillis: () => Date.now() })),
        fromDate: jest.fn((date) => ({ toDate: () => date, toMillis: () => date.getTime() }))
    }
};
