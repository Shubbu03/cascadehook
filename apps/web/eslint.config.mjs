import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      "no-debugger": "error",
      "no-console": ["error", { allow: ["warn", "error", "info"] }],
      "@typescript-eslint/no-unused-vars": "error",
    },
  },
]);

export default eslintConfig;
