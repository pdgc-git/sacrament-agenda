import { performance } from 'perf_hooks';

// Simulate firestore
class Doc {
  constructor(ref, data) {
    this.ref = ref;
    this.data = data;
  }
}

const mockDb = {
    _docs: [],
    collection: () => ({ id: 'members' }),
    doc: () => ({ id: Math.random().toString(36).substr(2, 9) }),
    addDoc: async (col, data) => {
        await new Promise(r => setTimeout(r, 10)); // Simulate 10ms network latency
        mockDb._docs.push(data);
        return { id: 'new-id' };
    },
    updateDoc: async (doc, data) => {
        await new Promise(r => setTimeout(r, 10)); // Simulate 10ms network latency
    },
    setDoc: async (doc, data) => {
        await new Promise(r => setTimeout(r, 10)); // Simulate 10ms network latency
    },
    writeBatch: () => {
        const operations = [];
        return {
            set: (doc, data) => operations.push(data),
            update: (doc, data) => operations.push(data),
            commit: async () => {
                await new Promise(r => setTimeout(r, 10 + operations.length * 0.1)); // 10ms + small cost per item
                mockDb._docs.push(...operations);
            }
        };
    }
};

async function saveMemberNPlus1(memberData) {
    await mockDb.addDoc('members', memberData);
}

async function saveMembersBatch(membersArray) {
    const batch = mockDb.writeBatch();
    for (const member of membersArray) {
        batch.set('doc', member);
    }
    await batch.commit();
}

async function runBenchmark() {
    const items = Array.from({ length: 100 }).map((_, i) => ({ name: `Member ${i}`, group: 'Adult' }));

    console.log(`Benchmarking 100 inserts...`);

    // N+1
    const startN1 = performance.now();
    for (const item of items) {
        await saveMemberNPlus1(item);
    }
    const endN1 = performance.now();
    console.log(`N+1 Writes: ${(endN1 - startN1).toFixed(2)}ms`);

    // Batch
    const startBatch = performance.now();
    await saveMembersBatch(items);
    const endBatch = performance.now();
    console.log(`Batch Writes: ${(endBatch - startBatch).toFixed(2)}ms`);

    console.log(`Improvement: ${((endN1 - startN1) / (endBatch - startBatch)).toFixed(2)}x faster`);
}

runBenchmark();
