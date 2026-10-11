// ESLint flat config (ESLint 9+ / Next.js 16).
//
// Next.js 16 removed the built-in `next lint` command, and the prebuilt
// `eslint-config-next` preset pulls in TypeScript tooling this JS-only
// project doesn't install. So we wire the individual plugins directly —
// all of them are already present in devDependencies (via eslint-config-next).
import js from "@eslint/js";
import globals from "globals";
import next from "@next/eslint-plugin-next";
import react from "eslint-plugin-react";
import hooks from "eslint-plugin-react-hooks";
import a11y from "eslint-plugin-jsx-a11y";

export default [
  // Don't lint build output, deps, or the PDF.js worker/vendored files.
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "public/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      react,
      "react-hooks": hooks,
      "jsx-a11y": a11y,
      "@next/next": next,
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      // Base configs first…
      ...next.configs["core-web-vitals"].rules,
      ...react.configs.flat.recommended.rules,
      ...hooks.configs["recommended-latest"].rules,
      ...a11y.flatConfigs.recommended.rules,

      // …then our overrides last so they win.
      // React 19 + the Next JSX transform — a React import is not required.
      "react/react-in-jsx-scope": "off",
      "react/jsx-uses-react": "off",
      "react/jsx-uses-vars": "error",
      // No TypeScript prop types in this JS project.
      "react/prop-types": "off",
      // Catch real footguns without being noisy on a large JS codebase.
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      // Apostrophes/quotes in JSX are a stylistic nuisance, not a defect.
      "react/no-unescaped-entities": "warn",

      // React 19 "compiler" lint rules (recommended-latest) are intentionally
      // strict and would require rewriting this app's fetch-in-effect data
      // pattern. Keep them visible as warnings, but don't fail the build.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/exhaustive-deps": "warn",

      // Accessibility interaction rules fire constantly on the clickable-row
      // / clickable-card pattern this app uses everywhere. Surface as warnings
      // rather than blocking an internal business tool.
      "jsx-a11y/label-has-associated-control": "off",
      "jsx-a11y/no-autofocus": "off",
      "jsx-a11y/click-events-have-key-events": "warn",
      "jsx-a11y/no-static-element-interactions": "warn",
      "jsx-a11y/no-noninteractive-element-interactions": "warn",
    },
  },
];
