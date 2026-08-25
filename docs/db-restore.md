# Database backup & restore

## What is backed up, where, and when

Every night at 08:15 UTC (≈4:15 AM ET) a Vercel cron job dumps the
irreplaceable tables — clients, orders, service orders, document metadata,
operating-agreement profiles and generations, library metadata, webhook
events, and the Sunbiz sync watermark — as gzipped JSON into **private
Vercel Blob storage** under `backups/db-YYYY-MM-DD.json.gz`. The newest 30
dumps are kept; older ones are pruned automatically.

Deliberately excluded:

- `fl_entities` — the 4.7M-row Sunbiz mirror, fully reloadable from the
  state's files (`webapp/scripts/sunbiz-load.ts`).
- `sessions` and `auth_tokens` — ephemeral sign-ins and one-time secrets.
  After a restore, clients simply sign in again ("Forgot password" works
  because their accounts are restored).

Taxpayer-number ciphertext is backed up exactly as stored — encrypted. The
key is derived from `SESSION_SECRET` in the Vercel environment, so a stolen
dump does not expose numbers — and a restore must keep `SESSION_SECRET`
unchanged or stored ciphertexts become unreadable.

The **admin panel → Reference Library tab → Database backups card** shows the
newest dump's date and size, and has a "Back up now" button. If the newest
dump is more than a day old, the nightly cron is broken — investigate.

This complements (does not replace) Neon's instant restore: Neon can rewind
the live database to any moment in its history window; these dumps survive
the loss of Neon itself.

## Restore

1. **Download a dump**: admin panel → Reference Library → Database backups →
   click the dump. (It downloads through the authed admin API.)
2. **Create the target database**: a fresh Neon database (new project, or a
   new database in the existing project).
3. **Create the schema**: run the app once against the empty database — the
   server's migrations create every table on startup:
   `DATABASE_URL=postgres://<target> bun run --watch server/dev.ts` (Ctrl-C
   once it's listening).
4. **Dry-run first** — prints the dump's date and per-table row counts,
   touches nothing:
   `bun run scripts/db-restore.ts db-2026-08-25.json.gz --dry-run`
5. **Restore**:
   `DATABASE_URL=postgres://<target> bun run scripts/db-restore.ts db-2026-08-25.json.gz`
   The script refuses a target that already contains clients unless
   `--force` is passed.
6. **Cut over**: change `DATABASE_URL` in Vercel's env settings to the new
   database and redeploy. All other env vars stay as they
   are — especially `SESSION_SECRET` (see above).

What is lost in this path: anything written after the dump was taken (up to
24 hours), and all active sign-in sessions. Client documents live in Blob
storage, not the database, and are unaffected.
