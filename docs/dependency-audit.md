# Dependency advisory triage

Gated by nothing mechanical — this file records the judgment `bun audit`
cannot make: whether each remaining advisory's vulnerable code path is
reachable in THIS application. Re-run `bun audit` and update this file
whenever dependencies change. Baseline: 29 Aug 2026, after removing three
unused dependencies (@hookform/resolvers, date-fns, framer-motion) and
applying every compatible update — 46 advisories became 31 (19 high,
12 moderate); the 29 Aug scaffolding removal took it to 28 (18 high, 10
moderate).

UPDATE, 29 Aug 2026 — the major upgrades ran (Vite 5→8, React Router 6→7,
their toolchains): 28 advisories became 15, and the runtime advisory count
is ZERO. Both React Router advisories are fixed by version rather than
argued unreachable; the esbuild/rollup/postcss/nanoid advisories left with
Vite 5. The router's v7 runtime was verified in the browser: navigation
works and the migration warnings are gone.

The remaining 15 (12 high, 3 moderate) live entirely in four glob/cache
utilities inside the eslint and tailwind toolchains (brace-expansion,
minimatch, picomatch, flatted) — build-time-only ReDoS, never shipped to
production. Version-pinning overrides were tried and deliberately reverted:
different tools need these utilities at different majors, and forcing one
version risks breaking the toolchain for zero production gain. They will
clear naturally as eslint/tailwind release. 

## Remaining advisories, by reachability

**Build-time only — not shipped to production** (vite, rollup, esbuild,
postcss, picomatch, brace-expansion, minimatch, flatted, nanoid): these
run on the developer's machine and in Vercel's build container. The
production site serves their OUTPUT, not the tools. The attack surface
(dev-server requests, ReDoS on globs during builds) does not exist in
production. Risk accepted until the post-launch Vite 7 migration.

**react-router / react-router-dom (2 moderate, runtime)** — fixes are in
v7 only:
- SSR hydration constructor injection (GHSA-337j-9hxr-rhxg): this app has
  no SSR — it is a static SPA; `deserializeErrors()` never runs.
- Open redirect via backslash in Link/useNavigate (GHSA-wrjc-x8rr-h8h6):
  requires user-controlled navigation targets; every Link and navigate()
  in this app uses hardcoded paths. Grep basis: no navigation call takes
  its destination from user input or the URL.

**lodash — RESOLVED 29 Aug 2026.** The earlier note here said lodash was
"pulled by the document toolchain"; that was wrong (Codex DEP-002 caught
it) — it arrived through recharts, a chart library nothing imported.
The sixth-audit scaffolding removal (35 unreachable UI files, 25
dependencies, both independently derived from the module graph) removed
recharts, and every lodash advisory with it. The correction stands here
because a wrong reachability reason that happens to reach the right
verdict is still a wrong reason, and this file's authority is the
reasoning.

## The rule

An advisory is closed here only by (a) an applied update, or (b) a named
reason the vulnerable path cannot execute in this deployment — never by
"probably fine."
