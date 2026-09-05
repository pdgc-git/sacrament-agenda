// Chainable mock for supabase-js's PostgrestFilterBuilder. Each chain method returns the same
// object so call order doesn't matter, and the object is thenable so `await` on any point in the
// chain (or a terminal `.single()`/`.maybeSingle()`) resolves to the configured { data, error }.
function mockChain(result = { data: null, error: null }) {
    const chain = {
        select: jest.fn(() => chain),
        insert: jest.fn(() => chain),
        update: jest.fn(() => chain),
        delete: jest.fn(() => chain),
        upsert: jest.fn(() => chain),
        eq: jest.fn(() => chain),
        gte: jest.fn(() => chain),
        lte: jest.fn(() => chain),
        order: jest.fn(() => chain),
        limit: jest.fn(() => chain),
        maybeSingle: jest.fn(() => Promise.resolve(result)),
        single: jest.fn(() => Promise.resolve(result)),
        then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    };
    return chain;
}

const supabase = {
    from: jest.fn(() => mockChain()),
    rpc: jest.fn(() => Promise.resolve({ data: null, error: null })),
};

module.exports = { supabase, mockChain };
