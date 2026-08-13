import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "src");

// Mirrors the "@/*" -> "./src/*" alias in jsconfig.json. Next resolves that
// itself during a build, but vitest needs it spelled out to test modules
// under src/app that import shared code via "@/lib/...".
const alias = { "@": src };

// Two tiers, split by environment rather than merged into one jsdom run.
//
// The pure-logic suite is the overwhelming majority of the tests and none of
// it touches a DOM. Running it under jsdom would build and tear down a full
// document per file for no benefit, and — worse — would hide the class of bug
// where a lib module reaches for `window`: under node such a module throws
// here, which is exactly what we want, since sitemap.js and robots.js import
// these from a server context where there is no window either.
//
// The component tier is opt-in by filename (*.test.jsx) so that adding a
// component test is a naming decision and cannot silently pull a logic test
// into jsdom.
export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "logic",
          environment: "node",
          include: ["src/**/*.test.js"],
        },
      },
      {
        // This project keeps JSX in `.js` files, which Next accepts and Vite
        // does not assume. Both halves below are needed: `include` puts .js
        // through the react plugin's transform, and the esbuild loader
        // override stops Vite's own pre-transform rejecting the JSX first.
        // This project keeps JSX in `.js` files, which Next accepts but Vite
        // does not assume. Vite 8 transforms via oxc rather than esbuild, and
        // two separate defaults have to be overridden to get `.js` through:
        //
        //   - `exclude` defaults to /\.js$/, so .js never reaches the
        //     transform at all;
        //   - `lang` is otherwise derived from the file extension, and "js"
        //     means the parser has JSX disabled — which is the error you get
        //     ("JSX syntax is disabled") if you fix only the filter.
        //
        // An `esbuild: { loader: "jsx" }` block is the Vite 5/6 answer and is
        // silently ignored here, so it looks right and changes nothing.
        oxc: { include: /src\/.*\.[jt]sx?$/, exclude: [], lang: "jsx" },
        resolve: { alias },
        test: {
          name: "components",
          environment: "jsdom",
          include: ["src/**/*.test.jsx"],
          setupFiles: ["./vitest.setup.jsx"],
        },
      },
    ],
  },
});
