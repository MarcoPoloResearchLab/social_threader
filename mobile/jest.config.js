module.exports = {
  testEnvironment: "node",
  transform: {
    "^.+\\.[cm]?[jt]sx?$": "babel-jest"
  },
  moduleNameMapper: {
    "^react-native$": "<rootDir>/tests/mocks/reactNative.js",
    "^expo-status-bar$": "<rootDir>/tests/mocks/expoStatusBar.js"
  },
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  collectCoverageFrom: ["App.js", "src/**/*.js", "!src/shared-web/**/*.js"],
  coverageReporters: ["text-summary"],
  coverageThreshold: {
    global: {
      statements: 100,
      branches: 100,
      functions: 100,
      lines: 100
    }
  }
};
