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
    // Building kit copied unchanged from /workspace/codecity-components.
    "components/city/kit/**",
    // The static CodeLens frontend (user design, vendored three.js / Monaco, generated bridge bundle).
    "public/**",
    "design-source/**",
  ]),
]);

export default eslintConfig;
