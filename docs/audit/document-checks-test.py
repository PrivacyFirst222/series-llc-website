#!/usr/bin/env python3
"""Batch 21 document-check regressions: B3-04, B6-02 and B6-03.

B3-04 and B6-03 are documentation corrections, with no executable changes.
B6-02 is exercised here with complete master blocks and small suffix fixtures.
An optional --root permits running the same assertions against an earlier tree.
"""
import argparse
from pathlib import Path
import re
import tempfile
import unittest

parser = argparse.ArgumentParser()
parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2])
args, remaining = parser.parse_known_args()
ROOT = args.root.resolve()
script = ROOT / "docs/structure.py"
structure = {"__name__": "structure_under_test", "__file__": str(script)}
exec(compile(script.read_text(), str(script), "exec"), structure)
MASTER = (ROOT / "webapp/server/templates-oa-multi.md").read_text()


def swap_blocks(text, pattern, first, second, stop_at_heading=False):
    matches = list(re.finditer(pattern, text, re.M))
    blocks = {
        m.group(1): (m.start(), matches[i + 1].start() if i + 1 < len(matches) else len(text))
        for i, m in enumerate(matches)
    }
    if stop_at_heading:
        for key, (start, end) in list(blocks.items()):
            next_heading = re.search(r"^## ", text[start:end], re.M)
            if next_heading:
                blocks[key] = start, start + next_heading.start()
    a, b = blocks[first], blocks[second]
    if a[0] >= b[0]:
        raise AssertionError("fixture blocks must be in source order")
    return text[:a[0]] + text[b[0]:b[1]] + text[a[1]:b[0]] + text[a[0]:a[1]] + text[b[1]:]


class DocumentChecks(unittest.TestCase):
    def inspect(self, text):
        with tempfile.TemporaryDirectory(prefix="document-check-") as directory:
            path = Path(directory) / "fixture.md"
            path.write_text(text)
            return structure["check"](str(path))

    def rejects(self, text, expected):
        self.assertNotEqual(text, MASTER, "a mutation must change the actual master")
        problems = self.inspect(text)
        self.assertTrue(any(expected in p for p in problems), f"expected {expected!r}; got {problems}")

    def test_all_eight_current_masters(self):
        self.assertEqual(len(structure["MASTERS"]), 8)
        for master in structure["MASTERS"]:
            with self.subTest(master=master):
                self.assertEqual(structure["check"](str(ROOT / master)), [])

    def test_complete_sections_swapped(self):
        changed = swap_blocks(MASTER, r"^\*\*(\d+\.\d+[A-Z]?)\s", "7.1", "7.2", stop_at_heading=True)
        self.rejects(changed, "sections are out of source order")

    def test_complete_articles_swapped(self):
        changed = swap_blocks(MASTER, r"^## ARTICLE (\d+)\b", "7", "8")
        self.rejects(changed, "articles are out of source order")

    def test_section_moved_under_wrong_article(self):
        match = re.search(r"^\*\*7\.2\s.*?(?=^## ARTICLE 8)", MASTER, re.M | re.S)
        self.assertIsNotNone(match)
        changed = MASTER[:match.start()] + MASTER[match.end():]
        changed = changed.replace("**8.1 ", match.group(0) + "**8.1 ", 1)
        self.rejects(changed, "Section 7.2 sits under ARTICLE 8")

    def test_section_before_any_article(self):
        self.rejects("**1.1 First.** Text.\n\n## ARTICLE 1\n", "Section 1.1 sits before any ARTICLE heading")

    def test_consecutive_sections_and_articles(self):
        self.assertEqual(self.inspect("## ARTICLE 1\n**1.1 First.** Text.\n**1.2 Second.** Text.\n"
                                      "## ARTICLE 2\n**2.1 Third.** Text.\n"), [])

    def test_letter_suffixes_remain_supported(self):
        self.assertEqual(self.inspect("## ARTICLE 1\n**1.1 First.** Text.\n**1.1A Added.** Text.\n"
                                      "**1.1B Added again.** Text.\n**1.2 Second.** Text.\n"), [])

    def test_letter_suffixes_out_of_order(self):
        self.rejects("## ARTICLE 1\n**1.1 First.** Text.\n**1.1B Added.** Text.\n"
                     "**1.1A Added again.** Text.\n**1.2 Second.** Text.\n", "sections are out of source order")

    def test_numeric_sort_not_lexical_sort(self):
        text = "## ARTICLE 1\n" + "".join(f"**1.{n} Section.** Text.\n" for n in range(1, 12))
        self.assertEqual(self.inspect(text), [])

    def test_existing_missing_section_detection(self):
        self.rejects(MASTER.replace("**7.2 ", "**7.9 ", 1), "Section 7.2 is missing")

    def test_existing_duplicate_detection(self):
        self.rejects(MASTER.replace("**7.2 ", "**7.1 ", 1), "used by two provisions")

    def test_existing_missing_article_detection(self):
        changed = re.sub(r"^## ARTICLE 16[^\n]*\n", "", MASTER, count=1, flags=re.M)
        self.rejects(changed, "no ARTICLE 16 heading")


if __name__ == "__main__":
    unittest.main(argv=[__file__, *remaining], verbosity=2)
