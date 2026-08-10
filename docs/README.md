# Client-facing deliverables — masters, outputs, and inventory

**The markdown in this repository is the master. Word files are output.**

Anything typed into a `.docx` is lost the next time the generator runs. Edit the
master, and the Word file follows automatically.

Cloud sync is not version control. Dropbox has no diffable history, and an
overwrite or a bad sync destroys a marked-up draft with nothing to restore from.
That is why the masters live here.

## Masters → Word output

| Master (edit this) | Word output, in `docs/word/` and Dropbox |
|---|---|
| `webapp/server/templates-oa-single.md` | FPSLLC Operating Agreement - Manager-Managed Single Member (Disregarded) - DRAFT.docx |
| `webapp/server/templates-oa-multi.md` | FPSLLC Operating Agreement - Manager-Managed Multi-Member (Partnership) - DRAFT.docx |
| `webapp/server/templates-oa-s.md` | FPSLLC Operating Agreement - Manager-Managed (S Corporation) - DRAFT.docx |
| `webapp/server/templates-oa-member.md` | FPSLLC Operating Agreement - Member-Managed Multi-Member (Partnership) - DRAFT.docx |
| `webapp/server/templates-oa-member-s.md` | FPSLLC Operating Agreement - Member-Managed (S Corporation) - DRAFT.docx |
| `docs/owners-manual.md` | Series LLC Owners Manual - REVISED DRAFT.docx |

The five operating agreement masters are also what the portal uses to generate a
client's agreement, so the Word file and the client's PDF always come from the
same text.

### How the Word files stay current

A git `pre-commit` hook (`.claude/hooks/pre-commit.sh`, installed as a shim at
`.git/hooks/pre-commit`) regenerates and stages them whenever a master is
committed. **A master cannot be committed without its Word counterpart.**

To regenerate by hand at any time:

```bash
.claude/hooks/update-word-docs.sh
```

## Still authored in Word

These have no markdown master yet. They are pulled in by `bun run docs:sync`,
which also refreshes their mirrors. They will drift the same way the operating
agreements did until they are promoted to masters.

| Document | Committed copy | Mirror |
|---|---|---|
| Operating Agreement Instructions | `source/FPSLLC Operating Agreement Instructions - DRAFT.docx` | `oa-instructions.md` |

## History

- `source/` — the original Word and PDF documents as they existed on 8 August
  2026, before the markdown masters took over. Kept so the pre-generation
  versions are always recoverable.
- `oa-draft-*.md` — mirrors of those 8 August drafts. **Historical only.** The
  live masters are `webapp/server/templates-oa-*.md`.
- Tag `pre-word-generation` marks the commit before the first generation.

Generated deliverables with no separate document to lose:

- the S corporation election package — `webapp/server/s-election.ts`
- Terms of Service and Privacy Policy — `webapp/src/content/`

## Origin

Word files are delivered to, and the Word-authored ones collected from:

```
/Users/adam/Library/CloudStorage/Dropbox/00 SharedWithMac/FPSLLC Operating Agreement/
```

## The tools

| Script | Direction | Use |
|---|---|---|
| `md-to-docx.py` | master → Word | Generation. Writes to a temp file and only replaces the target after verifying the archive, so a failure cannot truncate a document. |
| `docx-to-md.py` | Word → markdown | One-time import of a Word document to promote it to a master, and mirrors of documents still authored in Word. |
| `sync.ts` (`bun run docs:sync`) | Dropbox → repo | Pulls only Word-authored documents. Refuses to touch generated ones. Fails if the origin folder holds a document not listed here. |
