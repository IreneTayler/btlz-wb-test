/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.(ts|js)"],
  transform: {
    "^.+\\.(ts|tsx|js)$": "babel-jest",
  },
  moduleFileExtensions: ["ts", "tsx", "js", "json"],
};

