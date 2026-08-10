# Vibecode Workspace

## Design from the user's seat, not the data model

This rule is not optional and is not waived by convenience.

1. **Where will the user look for this?** Put it there — not where the
   existing code made it convenient to add. If a control acts on something
   the user sees in one place, it belongs in that place.
2. **What will the user actually see?** Verify by opening the artifact —
   the rendered page, the generated PDF, the sent email — not by reading
   the code that produces it. Code that "should" produce the right output
   is not evidence.
3. **Would the user need to be told where it is?** If yes, it is in the
   wrong place. Fix the placement; do not write the explanation.

Name things what the user calls them, never what the table or the record
is called. "Generation history" is a database concept; "your agreements"
is what the user has.

When a question or control is hidden or skipped conditionally, confirm the
underlying value is still set. A question removed from the screen is not a
value removed from the system.

## Never trade accuracy for convenience

This rule is not optional. It is not waived by deadline, by output length,
or by how obvious the answer seems.

When choosing how to check something, the only question that matters is
whether the method can actually detect the failure it is supposed to detect.
A faster, shorter, or more readable method that cannot detect it is not a
check — it is a way of feeling finished.

Never:

- filter, truncate, sample, or summarize the output of a verification —
  read all of it
- check a subset of files, cases, or records when the claim covers all of
  them
- infer from the code what the artifact contains when the artifact can be
  opened
- assert on a case chosen because it was easy to construct rather than
  because it could fail
- stop at the first passing result when the question was "is it complete"
- substitute "should be fine", "likely", or "no unexpected issues" for a
  count, a diff, or the artifact itself

If the thorough version is genuinely expensive, do it anyway — or say
plainly that you did not, and exactly what you skipped. Never silently run
the cheap version and report its result as though it were the thorough one.

**The tell:** if you catch yourself making output easier to read, or a job
faster to finish, at the moment you are deciding whether your own work is
correct — stop and do it the slow way. That impulse is the bug.

**This rule covers reading source material, not only checking your own
work.** Reading part of a statute, a contract, a spec, or a file and
reporting on it as though you read the whole thing is the same failure. It
does not feel like a shortcut — narrowing to "the relevant part" feels like
expertise, which is exactly why it goes uncaught.

**Always state the scope as a fraction.** Never report a reading or a check
without saying how much of the whole it covered: "read ss. 605.2101-605.2802,
75,474 of the chapter's 417,137 characters" is checkable at a glance. "Read
the statute" is not. If the denominator is unknown, say that. This
requirement does not depend on judgment being right — it makes the judgment
visible so it can be rejected.

Two instances produced this rule. Searching for a term across five documents,
then excluding from the results every section already believed to be
intentional: the audit came back clean and five defects were still there.
Search the raw term with zero exclusions, read every hit, state the raw
count — "37 hits, 33 intentional, 4 to fix" is a verification, "no unexpected
hits" is not. Then, one turn after writing that rule, reading 18% of Chapter
605 and reporting it as having read the statute, without ever stating the
fraction.

## Every deliverable must have a home in version control

Before building anything that stores, serves, or delivers a document,
establish where the source document lives. If it is not in the repo, say so
immediately and do not proceed as though the question is settled.

- Anything the business sells, promises, or hands a client must exist in the
  repo — as source if we author it, or as a committed copy plus a converted,
  diffable version if it is authored elsewhere.
- `docs/README.md` is the inventory of every client-facing deliverable and
  its source path. A deliverable with no entry there is a defect to report,
  not a detail to assume someone else handles. `bun run docs:sync` refreshes
  the copies and fails if the origin folder holds anything untracked.
- Cloud sync is not version control. Dropbox, iCloud and Drive have no
  diffable history and silently propagate destruction.
- Never explain why something cannot be found until you have searched for it.
  "It's a PDF I can't read" was invented. "No path matching *manual* appears
  in `git log --all`" was checked. Only the second is an answer.

This rule exists because the Owner's Manual, the Instructions, and five
operating agreement drafts — every one of them a deliverable the pricing page
sells — lived only in Dropbox for the entire build, while the Reference
Library that serves them was built in this repo without anyone asking what it
would serve.

## Never use WebFetch

Never call WebFetch. Not for statutes, not for documentation, not for an
article, not for a quick look, not to check something small, not for
anything. There is no acceptable use and no exception.

To read a page, open it in the browser and take the text directly:

- `preview_start` or `navigate` to the URL
- `get_page_text`, or `javascript_tool` with `document.body.innerText`
  sliced into chunks for long documents

WebSearch may be used only to find URLs. Its result text may not be quoted,
cited, or relied on for any claim. Open the source and read it.

This workspace contains a mobile app and backend server.

<projects>
  webapp/          — React app (port 8000)
  webapp/server/   — Hono API (all /api/* routes). Runs as ONE Vercel serverless
                     function via webapp/api/[[...route]].ts in production, and as a
                     local dev server on port 3000 via `bun run --hot server/dev.ts`
                     (vite proxies /api there). The old top-level backend/ was deleted
                     2026-08-02; do not recreate it. Server env vars are documented in
                     webapp/.env.example; every integration has a dev fallback (local
                     DB via PGlite, fake checkout, logged emails, local file storage).

  In production, the webapp uses relative URLs (/api/...) so it works on any domain.
  VITE_BACKEND_URL is only needed in development for cross-origin requests to the backend on a different port.

  Set `baseURL: env.BACKEND_URL` in betterAuth() config (required for crossSubDomainCookies, harmless otherwise —
  proxy headers override via trustedProxyHeaders: true).
  The webapp auth client (createAuthClient) should use: baseURL: import.meta.env.VITE_BACKEND_URL || undefined
  The webapp API helper should use: import.meta.env.VITE_BACKEND_URL || "" (empty string = relative URLs)
</projects>

<agents>
  Use subagents for project-specific work:
  - backend-developer: Changes to the backend API
  - webapp-developer: Changes to the webapp frontend

  Each agent reads its project's CLAUDE.md for detailed instructions.
</agents>

<coordination>
  When a feature needs both frontend and backend:
  1. Define Zod schemas for request/response in backend/src/types.ts (shared contracts)
  2. Implement backend route using the schemas
  3. Test backend with cURL (use $BACKEND_URL, never localhost)
  4. Implement frontend, importing schemas from backend/src/types.ts to parse responses
  5. Test the integration

  <shared_types>
    All API contracts live in backend/src/types.ts as Zod schemas.
    Both backend and frontend can import from this file — single source of truth.
  </shared_types>
</coordination>

<skills>
  Shared skills in .claude/skills/:
  - database-auth: Set up Prisma + Better Auth for user accounts and data persistence
  - ai-apis-like-chatgpt: Use this skill when the user asks you to make an app that requires an AI API.

  Frontend only skills:
  - frontend-app-design: Create distinctive, production-grade web interfaces using React, Tailwind, and shadcn/ui. Use when building pages, components, or styling any web UI.
</skills>

<environment>
  System manages git and dev servers. DO NOT manage these.
  The user views the app through Vibecode Mobile App with a webview preview or Vibecode Web App with an iframe preview.
  The user cannot see code or terminal. Do everything for them.
  Write one-off scripts to achieve tasks the user asks for.
  Communicate in an easy to understand manner for non-technical users.
  Be concise and don't talk too much.
</environment>
