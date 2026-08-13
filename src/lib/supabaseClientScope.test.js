import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

// Server-side Supabase clients must be built PER REQUEST, never at module
// scope.
//
// `createClient` throws on an empty URL at evaluation time, and Next evaluates
// every route module while collecting page data — `dynamic = "force-dynamic"`
// does not exempt it. So one module-scope client makes the whole production
// build fail whenever the env vars are absent, with `supabaseUrl is required`
// and a stack naming neither the offending file nor the missing variable. It
// has already cost two builds: /api/shorten and /s/[code].
//
// This is a source-shape test rather than a behavioural one, which is unusual
// here and deliberate: the failure is a *build* failure, so no amount of
// runtime testing can reach it, and CI's build step only catches it if CI is
// run without the secrets. Asserting the shape is what makes the rule hold.

const SERVER_FILES = [
  "src/app/api/shorten/route.js",
  "src/app/s/[code]/page.js",
  "src/app/api/admin/newsletter/route.js",
  "src/lib/newsletterDb.js",
  "src/lib/rateLimitDb.js",
];

function read(relative) {
  return readFileSync(path.join(process.cwd(), relative), "utf8");
}

/**
 * Strips comments and string literals so the scan sees code, not prose. The
 * long explanatory comments in these files mention `createClient(` repeatedly.
 */
function stripCommentsAndStrings(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '""');
}

/** Whether a `createClient(` call sits at the top level of the module. */
function hasModuleScopeCreateClient(source) {
  const code = stripCommentsAndStrings(source);
  const index = code.indexOf("createClient(");
  if (index === -1) return false;

  // Depth of enclosing braces at the call site: 0 means module scope, which is
  // exactly the shape that breaks the build.
  let depth = 0;
  for (let i = 0; i < index; i++) {
    if (code[i] === "{") depth++;
    else if (code[i] === "}") depth--;
  }
  return depth === 0;
}

describe("server-side Supabase clients", () => {
  it.each(SERVER_FILES)("builds its client inside a function, not at module scope: %s", (file) => {
    expect(hasModuleScopeCreateClient(read(file))).toBe(false);
  });

  it("detects a module-scope client when there is one", () => {
    // Guards the guard: without this, a broken matcher would pass every case
    // above by simply never finding anything.
    expect(
      hasModuleScopeCreateClient(`
        import { createClient } from "@supabase/supabase-js";
        const supabase = createClient(process.env.URL, process.env.KEY);
      `)
    ).toBe(true);
  });

  it("does not mistake a call inside a function for module scope", () => {
    expect(
      hasModuleScopeCreateClient(`
        import { createClient } from "@supabase/supabase-js";
        function db() { return createClient(process.env.URL, process.env.KEY); }
      `)
    ).toBe(false);
  });

  it("is not fooled by createClient mentioned only in a comment", () => {
    expect(
      hasModuleScopeCreateClient(`
        // A module-scope createClient(a, b) would break the build.
        function db() { return createClient(1, 2); }
      `)
    ).toBe(false);
  });

  it("still allows the browser client to be created at module scope", () => {
    // lib/supabaseClient.js is the exception and is deliberately absent from
    // SERVER_FILES: it is reached only via `await import()` from client code,
    // after the env vars have been inlined into the bundle, so it is never
    // evaluated during page-data collection.
    expect(hasModuleScopeCreateClient(read("src/lib/supabaseClient.js"))).toBe(true);
  });
});
