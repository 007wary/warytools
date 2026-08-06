import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

// Statically importing the Supabase client is a size trap with no visible
// symptom. lib/analytics.js is imported by 19 client components *and* by
// AnalyticsRouteTracker in the root layout, so anything it reaches
// transitively lands in the initial bundle of every page. That is exactly
// how the whole SDK — GoTrue, realtime, storage, postgrest, ~212 KB — ended
// up on all 35 routes to serve one fire-and-forget rpc() that never runs
// before a user interaction. Nothing in the build output, the test suite or
// lint flagged it; it cost ~25 points of Lighthouse mobile performance.
//
// `await import("@/lib/supabaseClient")` at the call site is always correct
// here: every use is already inside an async function, and the client is
// only ever needed after an interaction.
//
// Server-only files are exempt below: there the module is never shipped to a
// browser, so a static import costs nothing.
const noStaticSupabaseImport = {
  files: ["src/**/*.js"],
  ignores: [
    // Route handlers and server components — server-side only.
    "src/app/api/**",
    "src/app/s/**",
    // The module itself, and the accessor that deliberately wraps it.
    "src/lib/supabaseClient.js",
  ],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        paths: [
          {
            name: "@/lib/supabaseClient",
            message:
              "Import this dynamically — `const { supabase } = await import(\"@/lib/supabaseClient\")`. A static import puts the ~212 KB Supabase SDK in the initial bundle of every page (see eslint.config.mjs).",
          },
          {
            name: "./supabaseClient",
            message:
              "Import this dynamically — `const { supabase } = await import(\"./supabaseClient\")`. A static import puts the ~212 KB Supabase SDK in the initial bundle of every page (see eslint.config.mjs).",
          },
        ],
      },
    ],
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  noStaticSupabaseImport,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
