import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // api/index.mjs is the esbuild bundle committed for Vercel to serve — a
  // build artifact, not source. Linting it produced most of this project's
  // warnings (unused eslint-disable directives inside vendored dependencies),
  // which is noise that hides real findings in our own code.
  { ignores: ["dist", "api/index.mjs"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-empty-interface": "off",
      "@typescript-eslint/no-empty-object-type": "off",
    },
  },
  // The check scripts drive a browser offline. A route handler is installed
  // only through scripts/browser-isolation.ts (guardedRoute), which takes the
  // isolation decision before any handler runs; a bare page.route or
  // context.route would run its handler first (Codex's review of the fix
  // ledger, revision 2, E).
  {
    files: ["scripts/**/*.ts"],
    ignores: ["scripts/browser-isolation.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.type='MemberExpression'][callee.property.name='route']",
          message: "Install route handlers through guardedRoute / guardedContextRoute from ./browser-isolation, never page.route or context.route directly.",
        },
      ],
    },
  }
);
