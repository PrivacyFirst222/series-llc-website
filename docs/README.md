# Client-facing deliverables — inventory and system of record

**The repository is the system of record. Dropbox is where Adam authors.**

Every document this business sells, promises, or hands a client appears in the
table below with a committed copy. A deliverable that is not listed here, or
that has no committed copy, is a defect — report it, do not assume it is
handled somewhere else.

Cloud sync is not version control. Dropbox has no diffable history, and an
overwrite or a bad sync destroys a marked-up draft with nothing to restore
from. That is why these live here.

## Inventory

| Deliverable | Committed source | Diffable copy | Authored in |
|---|---|---|---|
| Series LLC Owner's Manual (revised draft) | `source/Series LLC Owners Manual - REVISED DRAFT.docx` | `owners-manual.md` | Dropbox |
| Series LLC Owner's Manual (earlier PDF) | `source/Series LLC Owners Manual.pdf` | — | Dropbox |
| Operating Agreement Instructions | `source/FPSLLC Operating Agreement Instructions - DRAFT.docx` | `oa-instructions.md` | Dropbox |
| OA draft — manager-managed, single member (disregarded) | `source/FPSLLC Operating Agreement - Manager-Managed Single Member (Disregarded) - DRAFT.docx` | `oa-draft-single-disregarded.md` | Dropbox |
| OA draft — manager-managed, multi-member (partnership) | `source/FPSLLC Operating Agreement - Manager-Managed Multi-Member (Partnership) - DRAFT.docx` | `oa-draft-multi-partnership.md` | Dropbox |
| OA draft — manager-managed (S corporation) | `source/FPSLLC Operating Agreement - Manager-Managed (S Corporation) - DRAFT.docx` | `oa-draft-manager-s-corp.md` | Dropbox |
| OA draft — member-managed, multi-member (partnership) | `source/FPSLLC Operating Agreement - Member-Managed Multi-Member (Partnership) - DRAFT.docx` | `oa-draft-member-partnership.md` | Dropbox |
| OA draft — member-managed (S corporation) | `source/FPSLLC Operating Agreement - Member-Managed (S Corporation) - DRAFT.docx` | `oa-draft-member-s-corp.md` | Dropbox |

Generated deliverables are not listed here because they are built from
repository source and have no separate document to lose:

- the five operating agreement masters — `webapp/server/templates-oa-*.md`
- the S corporation election package — `webapp/server/s-election.ts`
- Terms of Service and Privacy Policy — `webapp/src/content/`

## Origin

The `.docx` and `.pdf` files above are authored in:

```
/Users/adam/Library/CloudStorage/Dropbox/00 SharedWithMac/FPSLLC Operating Agreement/
```

## Keeping the copies current

After editing a document in Dropbox, refresh both the committed copy and the
markdown:

```bash
bun run docs:sync
```

That copies the source files in and regenerates every `.md` here. The `.docx`
is authoritative; the markdown exists so the content can be searched, diffed in
review, and read without opening Word. **Never hand-edit the generated
markdown** — the next sync overwrites it.
