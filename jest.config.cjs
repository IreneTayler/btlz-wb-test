/** @type {import('jest').Config} */
module.exports = {
    testEnvironment: "node",
    roots: ["<rootDir>/src", "<rootDir>/__tests__"],
    testMatch: ["**/__tests__/**/*.test.ts", "**/*.test.ts"],
    moduleNameMapper: {
        "^#(.*)\\.js$": "<rootDir>/src/$1.ts",
        "^#(.*)$": "<rootDir>/src/$1",
    },
    transform: {
        "\\.ts$": ["babel-jest", { configFile: "./babel.config.cjs" }],
    },
    transformIgnorePatterns: ["/node_modules/"],
    collectCoverageFrom: ["src/**/*.ts", "!src/**/*.d.ts"],
    coverageDirectory: "coverage",
};
