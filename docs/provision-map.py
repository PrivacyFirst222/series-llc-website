#!/usr/bin/env python3
"""The document's model, on disk, where a context window cannot lose it.

Claude does not carry a model of the operating agreements between turns. It
rebuilds one each time from whatever is on the screen, so a rule stated three
messages ago gets applied to the paragraph in front of it and nowhere else.
That is how four provisions failing the same rule came to be caught one at a
time, by Adam, by reading.

This file makes the model an artifact and the rule a gate:

  1. EVERY numbered provision in the five masters must have a row in
     docs/oa-map.md naming who it binds, who benefits, and — for anything that
     can be breached — the sentence a plaintiff will say about it.

  2. Each row carries a hash of the provision's text. Change the provision and
     the hash no longer matches, so the row must be re-annotated. You cannot
     reword a covenant without restating who it is for.

  3. A covenant that benefits `nobody` fails. That is Adam's rule, mechanised:
     "If a provision creates a restriction that doesn't benefit the member or
     manager, it doesn't belong in the OA."

  4. Adding is expensive and deleting is free: a new provision fails until it
     is annotated; a deleted one needs nothing. --diff reports the net counts
     against HEAD so a commit leads with what it removed.

Identical provisions across masters share one row (the `masters` column lists
which forms carry it), so the map is the size of the document rather than five
times the document.

    python3 docs/provision-map.py --update   # add/refresh rows, keep annotations
    python3 docs/provision-map.py --check    # the gate; non-zero on any failure
    python3 docs/provision-map.py --diff     # provisions and words vs HEAD
"""
import hashlib
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MAP_PATH = os.path.join(HERE, "oa-map.md")

MASTERS = {
    "sgl": "webapp/server/templates-oa-single.md",
    "mul": "webapp/server/templates-oa-multi.md",
    "scp": "webapp/server/templates-oa-s.md",
    "mbr": "webapp/server/templates-oa-member.md",
    "mbs": "webapp/server/templates-oa-member-s.md",
}

# What a provision is FOR. Anything that can be breached is a covenant, and a
# covenant must name a beneficiary and the attack it invites.
CATEGORIES = {
    "authority",        # who may act, and what approval they need
    "benefit",          # confers a right or protection on a named person
    "statutory-route",  # states a way the Act itself establishes something
    "definition",       # defines a term used elsewhere
    "mechanic",         # machinery: notices, signatures, counterparts, exhibits
    "covenant",         # a duty or prohibition that can be breached
}
BENEFICIARIES = {"members", "member", "manager", "company", "series", "third-party", "nobody"}

COLUMNS = ["masters", "section", "heading", "hash", "category", "binds", "benefits", "attack", "source"]

PROVISION_RE = re.compile(
    r"^\*\*(\d+\.\d+[A-Z]?)\s+([^*]+?)\*\*(.*?)(?=^\*\*\d+\.\d+[A-Z]?\s|^## |\Z)",
    re.M | re.S,
)


def normalise(text):
    return re.sub(r"\s+", " ", text).strip()


def digest(heading, body):
    return hashlib.sha256(normalise(heading + " " + body).encode()).hexdigest()[:8]


def provisions(path):
    """(section, heading, body) for every numbered provision in one master."""
    text = open(path).read()
    for m in PROVISION_RE.finditer(text):
        yield m.group(1).strip(), m.group(2).strip().rstrip("."), m.group(3).strip()


def collect(root=ROOT):
    """Unique provisions across the masters, keyed by (section, hash).

    Identical text in five forms is one row listing the forms that carry it.
    """
    found = {}
    for code, rel in MASTERS.items():
        path = os.path.join(root, rel)
        if not os.path.exists(path):
            raise SystemExit(f"master missing: {rel}")
        for section, heading, body in provisions(path):
            key = (section, digest(heading, body))
            entry = found.setdefault(key, {"section": section, "heading": heading,
                                           "hash": key[1], "masters": []})
            entry["masters"].append(code)
    return found


def read_map():
    """Existing rows keyed by (section, hash)."""
    if not os.path.exists(MAP_PATH):
        return {}
    rows = {}
    for line in open(MAP_PATH):
        if not line.startswith("|") or line.startswith("|---") or line.startswith("| masters"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) != len(COLUMNS):
            continue
        row = dict(zip(COLUMNS, cells))
        rows[(row["section"], row["hash"])] = row
    return rows


HEADER = """# Provision map — the model of the five operating agreement masters

Generated and gated by `docs/provision-map.py`. **Do not hand-edit the
`masters`, `section`, `heading` or `hash` columns** — they are read from the
masters. Do edit `category`, `binds`, `benefits`, `attack` and `source`: those
are the judgment, and they are what Adam vetoes.

A row exists for every numbered provision. Identical text across forms shares
one row. Change a provision and its hash changes, so the row must be
re-annotated before the change can be committed — you cannot reword a covenant
without restating who it is for.

`benefits: nobody` on a `covenant` is a failure, not a note: a restriction that
benefits neither the members nor the manager does not belong in the agreement.
Teaching that cannot be breached goes in the Owner's Manual instead.

Forms: `sgl` single-member · `mul` multi-member · `scp` S corporation ·
`mbr` member-managed · `mbs` member-managed S corporation.
"""


def sort_key(item):
    (section, _), _ = item
    major, _, minor = section.partition(".")
    return (int(major), int(re.sub(r"[A-Z]", "", minor) or 0), minor)


def write_map(found, existing):
    out = [HEADER, "| " + " | ".join(COLUMNS) + " |",
           "|" + "|".join(["---"] * len(COLUMNS)) + "|"]
    carried = new = 0
    for key, entry in sorted(found.items(), key=sort_key):
        prior = existing.get(key)
        carried += 1 if prior else 0
        new += 0 if prior else 1
        row = {
            "masters": " ".join(sorted(entry["masters"])),
            "section": entry["section"],
            "heading": entry["heading"],
            "hash": entry["hash"],
        }
        for col in ("category", "binds", "benefits", "attack", "source"):
            row[col] = prior[col] if prior else "TODO"
        out.append("| " + " | ".join(row[c] for c in COLUMNS) + " |")
    open(MAP_PATH, "w").write("\n".join(out) + "\n")
    return carried, new


def check():
    found = collect()
    rows = read_map()
    problems = []

    for key, entry in sorted(found.items(), key=sort_key):
        row = rows.get(key)
        label = f"s. {entry['section']} {entry['heading']}"
        if row is None:
            stale = [r for (s, _), r in rows.items() if s == entry["section"]]
            if stale:
                problems.append(
                    f"{label} — text changed since it was annotated (now {entry['hash']}, "
                    f"map has {stale[0]['hash']}). Re-affirm who it binds and who benefits, "
                    "then run --update.")
            else:
                problems.append(f"{label} — no row in oa-map.md; a new provision is not "
                                "committable until it names a beneficiary")
            continue
        for col in ("category", "binds", "benefits", "attack", "source"):
            if row[col].strip() in ("", "TODO"):
                problems.append(f"{label} — `{col}` is unanswered")
        cat = row["category"].strip()
        if cat not in CATEGORIES and cat != "TODO":
            problems.append(f"{label} — category `{cat}` is not one of {sorted(CATEGORIES)}")
        given = {b.strip() for b in row["benefits"].replace(",", " ").split() if b.strip()}
        unknown = given - BENEFICIARIES - {"TODO"}
        if unknown:
            problems.append(f"{label} — beneficiary {sorted(unknown)} is not one of "
                            f"{sorted(BENEFICIARIES)}")
        if cat == "covenant" and "nobody" in given:
            problems.append(f"{label} — a covenant that benefits nobody. Delete it, or move the "
                            "teaching to the Owner's Manual, where it cannot be breached.")
        if cat == "covenant" and row["attack"].strip() in ("", "TODO", "none", "-"):
            problems.append(f"{label} — a covenant with no `attack` line. Write the sentence a "
                            "plaintiff will say about it, or it does not go in.")

    for section, heading in sorted((k[0], r["heading"]) for k, r in rows.items() if k not in found):
        problems.append(f"s. {section} {heading} — row for a provision that no longer exists; "
                        "run --update")

    for p in problems:
        print("  " + p)
    if problems:
        print(f"\n{len(problems)} provision-map problem(s).", file=sys.stderr)
        return 1
    print(f"  ok    {len(found)} provisions, every one mapped to a beneficiary")
    return 0


def diff():
    """Net provisions and words against HEAD, so a commit can lead with removals."""
    def head_copy(rel):
        try:
            return subprocess.run(["git", "show", f"HEAD:{rel}"], cwd=ROOT,
                                  capture_output=True, text=True, check=True).stdout
        except subprocess.CalledProcessError:
            return ""

    added = removed = words_before = words_after = 0
    for rel in MASTERS.values():
        before_text, after_text = head_copy(rel), open(os.path.join(ROOT, rel)).read()
        words_before += len(before_text.split())
        words_after += len(after_text.split())
        before = {m.group(1) for m in PROVISION_RE.finditer(before_text)}
        after = {m.group(1) for m in PROVISION_RE.finditer(after_text)}
        added += len(after - before)
        removed += len(before - after)
    print(f"provisions: +{added} / -{removed}    words: {words_after - words_before:+d}")
    if added and not removed:
        print("  every addition needs a beneficiary in oa-map.md before it can be committed")
    return 0


def main():
    if "--update" in sys.argv:
        found = collect()
        carried, new = write_map(found, read_map())
        print(f"oa-map.md: {carried} annotation(s) carried, {new} row(s) needing annotation")
        return 0
    if "--diff" in sys.argv:
        return diff()
    if "--check" in sys.argv or len(sys.argv) == 1:
        return check()
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main())
