import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["node_modules/", "migrations/", "migrations-platform/", "storage/", "coverage/", ".claude/"] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: { ...globals.node }
    },
    rules: {
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_|^next$|^req$|^res$", varsIgnorePattern: "^_", caughtErrors: "none" }
      ],
      "no-console": "error",
      eqeqeq: ["error", "always"],
      "prefer-const": "error",
      "no-var": "error",
      "object-shorthand": "error"
    }
  },
  {
    /* The framework layer must not depend on modules */
    files: ["src/common/**/*.js"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["**/modules/**"], message: "src/common is framework-only and must not import module code" }
          ]
        }
      ]
    }
  },
  {
    files: ["scripts/**/*.js", "test/**/*.js"],
    rules: { "no-console": "off" }
  }
];
