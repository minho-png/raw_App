import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // This project does not use React Compiler.
    // Disable react-compiler lint rules that produce false positives
    // for standard localStorage → setState hydration patterns.
    rules: {
      // This project does not use React Compiler.
      // react-hooks/set-state-in-effect flags the standard localStorage → setState
      // hydration pattern (useEffect runs client-side only) as false positives.
      "react-hooks/set-state-in-effect": "off",
      // Impure function calls (e.g., Date.now()) during render are intentional.
      "react-hooks/no-call-impure-function-during-render": "off",
      "react-hooks/purity": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Submodule — has its own ESLint config
    "pixel-agents/**",
    // Legacy/unused architecture layers (not part of active app)
    "services/**",
    "server/**",
    "store/**",
  ]),
]);

export default eslintConfig;
