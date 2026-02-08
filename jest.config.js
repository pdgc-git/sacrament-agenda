module.exports = {
    testEnvironment: 'jsdom',
    transform: {
        '^.+\\.js$': 'babel-jest',
    },
    moduleNameMapper: {
        // Map CDN URLs to local mocks
        "^https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js$": "<rootDir>/__mocks__/firebaseAuth.js",
        "^https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js$": "<rootDir>/__mocks__/firebaseFirestore.js",
        // Map local styles
        "\\.(css|less)$": "<rootDir>/__mocks__/styleMock.js"
    }
};
