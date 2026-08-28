# Dependency advisory triage

Gated by nothing mechanical — this file records the judgment `bun audit`
cannot make: whether each remaining advisory's vulnerable code path is
reachable in THIS application. Re-run `bun audit` and update this file
whenever dependencies change. Baseline: 29 Aug 2026, after removing three
unused dependencies (@hookform/resolvers, date-fns, framer-motion) and
applying every compatible update — 46 advisories became 31 (19 high,
12 moderate).

Everything remaining requires a breaking major-version jump (Vite 5→7,
React Router 6→7, and their toolchains). The pre-launch decision, per the
audit's own recommendation: update compatibly, document reachability,
schedule the majors after launch.

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

**lodash (3, transitive)** — pulled by the document toolchain, used at
generation time on trusted inputs (our own masters), never on client
input. No fixed release exists at the vulnerable range's ceiling.

## The rule

An advisory is closed here only by (a) an applied update, or (b) a named
reason the vulnerable path cannot execute in this deployment — never by
"probably fine."
