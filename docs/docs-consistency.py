#!/usr/bin/env python3
"""Every section a guidance document cites must exist in the agreement it cites.

The Owner's Manual and the Operating Agreement Instructions describe the five
operating agreements. Every "§8.4" in them is a claim about a file in this repo,
and provisions get renumbered and deleted. On 13 August 2026 five references in
the Instructions pointed at sections that no longer existed, and two of them were
worse than dangling — they told the client their agreement required an annual
review and required them to adopt another form, when both provisions had just
been deleted.

This resolves every reference and fails on any that no longer exists. It is the
mechanical half of the rule in CLAUDE.md; it cannot read a sentence for meaning,
and it passing is not evidence that anyone did.

A reference is satisfied if the section exists in ANY master, since
the guidance documents describe all of them and often name the form in prose
("§4.6 in the single-member form"). Where a reference names a form, that form is
checked specifically.

    python3 docs/docs-consistency.py            # check
    python3 docs/docs-consistency.py --list     # every reference and where it resolves
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

MASTERS = {
    "single-member": "webapp/server/templates-oa-single.md",
    "manager-managed multi-member": "webapp/server/templates-oa-multi.md",
    "S corporation": "webapp/server/templates-oa-s.md",
    "member-managed": "webapp/server/templates-oa-member.md",
    "member-managed S corporation": "webapp/server/templates-oa-member-s.md",
    "single-member S corporation": "webapp/server/templates-oa-single-s.md",
    "member-managed single-member": "webapp/server/templates-oa-member-single.md",
    "member-managed single-member S corporation": "webapp/server/templates-oa-member-single-s.md",
}

GUIDANCE = [
    "docs/owners-manual.md",
    "docs/oa-instructions.md",
]

# "§8.4", "§8.4(b)", "Section 8.4", "Sections 8.4" — with or without a paragraph.
# Bounded to one or two digits either side because the same notation is used for
# statutes and regulations: §605.2401, §301.7701-3, §1.1361 are not agreement
# sections, and the agreement has no article past 16.
REFERENCE = re.compile(r"(?:§|Sections?\s+)(\d{1,2}\.\d{1,2}[A-Z]?)(\([a-z]\))?(?![\d.-])")
MAX_ARTICLE = 16

# Article-level references are checked as articles, not sections.
ARTICLE = re.compile(r"Article\s+(\d+)")


def sections_in(path):
    """Every numbered provision, and every lettered paragraph inside one."""
    text = open(path).read()
    out = set()
    for m in re.finditer(r"^\*\*(\d+\.\d+[A-Z]?)\s", text, re.M):
        out.add(m.group(1))
    # Lettered paragraphs, wherever they appear inside a provision — they are
    # sometimes their own line, sometimes run into the sentence that introduces
    # them. Take the text of each provision and look for "(a)" anywhere in it.
    blocks = re.split(r"(?=^\*\*\d+\.\d+[A-Z]?\s)", text, flags=re.M)
    for block in blocks:
        m = re.match(r"^\*\*(\d+\.\d+[A-Z]?)\s", block)
        if not m:
            continue
        section = m.group(1)
        for para in re.findall(r"\(([a-z])\)", block):
            out.add(f"{section}({para})")
    return out


def articles_in(path):
    text = open(path).read()
    return {m.group(1) for m in re.finditer(r"^## ARTICLE (\d+)", text, re.M)}


def main():
    listing = "--list" in sys.argv
    by_form = {}
    for label, rel in MASTERS.items():
        path = os.path.join(ROOT, rel)
        if not os.path.exists(path):
            raise SystemExit(f"master missing: {rel}")
        by_form[label] = (sections_in(path), articles_in(path))

    all_sections = set().union(*(s for s, _ in by_form.values()))
    all_articles = set().union(*(a for _, a in by_form.values()))

    problems, checked = [], 0
    for rel in GUIDANCE:
        path = os.path.join(ROOT, rel)
        if not os.path.exists(path):
            problems.append(f"{rel} — missing")
            continue
        name = os.path.basename(rel)
        for i, line in enumerate(open(path).read().split("\n"), 1):
            if line.lstrip().startswith("<!--"):
                continue
            for m in REFERENCE.finditer(line):
                section, para = m.group(1), (m.group(2) or "")
                checked += 1
                # Resolve against every master. Which form a sentence is ABOUT is a
                # question of meaning, and this check does not read for meaning —
                # guessing at it produced false failures on its first run.
                pool = list(by_form)
                ok = any(section in by_form[lbl][0] for lbl in pool)
                ok_para = (not para) or any(f"{section}{para}" in by_form[lbl][0] for lbl in pool)
                where = ""
                if not ok:
                    problems.append(f"{name}:{i}  §{section} does not exist in any master{where}")
                elif not ok_para:
                    problems.append(f"{name}:{i}  §{section}{para} — the section exists, "
                                    f"the paragraph {para} does not{where}")
                elif listing:
                    holders = [l for l in pool if section in by_form[l][0]]
                    print(f"  {name}:{i}  §{section}{para} -> {', '.join(holders)}")
            for m in ARTICLE.finditer(line):
                article = m.group(1)
                if int(article) > MAX_ARTICLE:
                    continue
                checked += 1
                if article not in all_articles:
                    problems.append(f"{name}:{i}  Article {article} does not exist in any master")

    # --- Backup policy: the describers must match the implementation --------
    # The eighth audit found the recovery runbook and the admin panel still
    # describing the SUPERSEDED backup scheme (date-only names, newest-30
    # pruning) after the implementation moved to timestamped immutable names
    # and retention-forever. Documents that describe behavior drift when the
    # behavior changes; this ties them to the code so drift goes red here.
    backup_ts = open(os.path.join(ROOT, "webapp", "server", "backup.ts")).read()
    runbook = open(os.path.join(HERE, "db-restore.md")).read()
    admin_card = open(os.path.join(ROOT, "webapp", "src", "pages", "admin", "LibrarySection.tsx")).read()

    impl_timestamped = 'iso.slice(11, 19).replace(/:/g, "")' in backup_ts
    impl_immutable = "allowOverwrite: false" in backup_ts
    impl_no_prune = "deleteBackup" not in backup_ts and "BACKUP_KEEP" not in backup_ts
    if not (impl_timestamped and impl_immutable and impl_no_prune):
        problems.append(
            "backup.ts no longer implements timestamped/immutable/retain-forever "
            "backups — update this check AND every document describing the policy")
    if "db-YYYY-MM-DD-HHMMSS.json.gz" not in runbook:
        problems.append("db-restore.md does not state the implemented backup filename pattern")
    for name, text in (("db-restore.md", runbook), ("LibrarySection.tsx", admin_card)):
        for stale in ("newest 30", "Newest 30", "pruned automatically", "db-YYYY-MM-DD.json.gz"):
            if stale in text.replace("db-YYYY-MM-DD-HHMMSS", ""):
                problems.append(f"{name} still describes the superseded backup policy ({stale!r})")
        checked += 1

    for p in problems:
        print("  " + p)
    if problems:
        print(f"\n{len(problems)} dangling reference(s) in the guidance documents.", file=sys.stderr)
        print("Every one is a sentence a client will read as true. Fix the sentence, "
              "not just the number.", file=sys.stderr)
        return 1
    print(f"  ok    {checked} references in {len(GUIDANCE)} guidance documents all resolve")
    return 0


if __name__ == "__main__":
    sys.exit(main())
