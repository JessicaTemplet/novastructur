import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Design-tool exports, not application source: raw generated code from
    // whatever produced the UI/*.dc mockup files, copied in for reference.
    // Not part of the Next.js build (nothing imports them), so linting them
    // as if they were maintained app code was just noise.
    "support.js",
    "UI/**",
    "src/app/NovaStructur App.tsx",
  ]),
]);

export default eslintConfig;
