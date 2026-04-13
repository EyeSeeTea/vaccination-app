module.exports = {
    collectCoverageFrom: ["src/**/*.js"],
    testPathIgnorePatterns: ["/node_modules/", "/cypress"],
    transformIgnorePatterns: ["/node_modules/(?!@eyeseetea/d2-ui-components)"],
    setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
    modulePaths: ["src"],
    moduleDirectories: ["node_modules"],
    watchPathIgnorePatterns: ["__snapshots__"],
    moduleNameMapper: {
        "\\.(css|scss)$": "<rootDir>/config/styleMock.js",
        "\\.(jpg|jpeg|png|svg)$": "<rootDir>/config/fileMock.js",
        "^!raw-loader!(.*)$": "jest-transform-stub",
    },
    transform: {
        "^.+\\.[t|j]sx?$": "babel-jest",
    },
    testRegex: "((\\.|/)(test|spec))\\.(jsx?|tsx?)$",
    moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
    globals: {
        window: true,
        document: true,
        navigator: true,
        Element: true,
    },
    roots: ["src"],
    testTimeout: 30000,
};
