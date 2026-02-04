module.exports = {
    testEnvironment: 'jsdom',
    transform: {
        '^.+\\.jsx?$': 'babel-jest',
    },
    moduleNameMapper: {
        '\\.(css|less)$': '<rootDir>/__mocks__/styleMock.js',
        '^https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js$': '<rootDir>/__mocks__/firebaseFirestore.js',
        '^https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js$': '<rootDir>/__mocks__/firebaseFirestore.js',
        '^https://www.gstatic.com/firebasejs/9.22.0/firebase-analytics.js$': '<rootDir>/__mocks__/firebaseFirestore.js',
        '^https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js$': '<rootDir>/__mocks__/firebaseFirestore.js'
    },
};
