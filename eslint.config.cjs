// ESLint (flat config). Run `npm run lint`.
// Correctness rules only: things that crash or silently misbehave at runtime. Style is
// left alone, so the existing code doesn't drown real problems in warnings.
const globals = require("globals");

module.exports = [
  {
    ignores: ["node_modules/**", "coverage/**"],
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
    linterOptions: {
      reportUnusedDisableDirectives: "warn",
    },
    rules: {
      // crashes at runtime
      "no-undef": "error",
      "no-unsafe-optional-chaining": "error",
      "no-func-assign": "error",
      "no-import-assign": "error",
      "no-shadow-restricted-names": "error",
      "valid-typeof": "error",
      // silently wrong
      "no-dupe-keys": "error",
      "no-dupe-class-members": "error",
      "no-duplicate-case": "error",
      "no-self-assign": "error",
      "no-redeclare": "error",
      "no-cond-assign": "error",
      "no-unsafe-finally": "error",
      "no-async-promise-executor": "error",
      "no-unreachable": "error",
      "no-labels": "error",
      "no-unused-labels": "error",
      "no-fallthrough": "warn",
      "no-constant-condition": "warn",
      // dead code
      "no-unused-vars": ["warn", { args: "none", caughtErrors: "none", varsIgnorePattern: "^_" }],
    },
  },
];
