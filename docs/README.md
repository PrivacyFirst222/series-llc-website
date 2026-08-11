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
| `docs/statement-of-authorized-representative.md` | FPSLLC Statement of Authorized Representative - FORM.docx |

The five operating agreement masters are also what the portal uses to generate a
client's agreement, so the Word file and the client's PDF always come from the
same text.

The Statement of Authorized Representative is furnished when a client appoints
us to sign and file their Articles under s. 605.0102(8)(a), so a bank looking at
the public record can see why the name on the Articles is not a member's. It has
**no baseline in `source/`** — it is new, not a reconstruction — so the format
check reports SKIP for it, which is correct. It is **not yet generated
automatically** on fulfilment: today it is completed from this form by hand.

### How the Word files stay current

A git `pre-commit` hook (`.claude/hooks/pre-commit.sh`, installed as a shim at
`.git/hooks/pre-commit`) regenerates and stages them whenever a master is
committed. **A master cannot be committed without its Word counterpart.**

To regenerate by hand at any time:

```bash
.claude/hooks/update-word-docs.sh
```

### The formatting gate

Generation writes to a staging directory first. Every document is measured
against `format-baseline.json` — justification, `keepLines`, headings, indents,
typeface, body size, colour, italics, tables, page numbers — taken from the
hand-formatted originals in `source/`. **If any document comes out less
formatted than its original, nothing is copied anywhere and the run fails.**
The pre-commit hook fails with it.

```bash
python3 docs/format-check.py docs/word/*.docx   # check
python3 docs/format-check.py --baseline         # rebuild from source/
```

Rebuild the baseline only when `source/` itself changes. Never rebuild it to
make a failure go away — that is the check deleting itself.

### The house typography

Measured from `source/`, applied by `md-to-docx.py`. Two profiles:

| | Owner's Manual | Operating agreements |
|---|---|---|
| Typeface | Georgia 11pt | Times New Roman 12pt |
| Body | justified, 8pt after, `keepLines` | justified, 8pt after, `keepLines` |
| Headings | 20pt part / 14pt chapter / 12pt sub, navy `0D2E55`, `keepNext` | 13pt Heading 1, black, `keepNext` |
| Front matter | title page + generated contents | centered caption block |
| Footer | centered page number | none, as in the original |

Markdown the masters use:

| Markup | Result |
|---|---|
| `<!-- titlepage ... -->` | title page; lines are `size\|text\|after=NNN\|accent` |
| `[[contents]]` | contents built from the document's own headings — it cannot drift |
| `# X` | part divider (manual) / document title (agreement) |
| `## X` | chapter (manual) / `ARTICLE` heading (agreement) |
| `### X` | sub-heading |
| `- x` | bullet |
| `1. x` | indented numbered item |
| `> x` | set-off block |
| `[[pagebreak]]` | page break |

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
