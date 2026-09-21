#!/usr/bin/env python3
"""Compare the actual TS helper with an independently structured 2026 oracle.

Uses only Python's standard calendar/date modules and the existing Bun runtime.
Reads repository files; does not write to the repository or access the network.
Usage: python3 calendar-oracle.py --repo /absolute/path/to/repo
"""
import argparse
import calendar
import datetime
import hashlib
import json
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--repo", type=Path, required=True)
args = parser.parse_args()
repo = args.repo.resolve()
D = datetime.date

# Read independently from IRS Publication 509 (2026), Legal holidays.
# In particular: April 16 DC Emancipation and July 3 observed Independence.
holiday_dates = [
    "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-16",
    "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07",
    "2026-10-12", "2026-11-11", "2026-11-26", "2026-12-25",
]
holidays = {D.fromisoformat(value) for value in holiday_dates}
cases = []
for n in range(730):
    formation = D(2025, 1, 1) + datetime.timedelta(days=n)
    year = formation.year + (formation.month + 1) // 12
    month = (formation.month + 1) % 12 + 1
    last = calendar.monthrange(year, month)[1]
    end = (D(year, month, formation.day) - datetime.timedelta(days=1)
           if formation.day <= last else D(year, month, last))
    raw = end + datetime.timedelta(days=15)
    if raw.year != 2026:
        continue
    expected = raw
    while expected.weekday() >= 5 or expected in holidays:
        expected += datetime.timedelta(days=1)
    cases.append({"formation": formation.isoformat(), "raw": raw.isoformat(),
                  "want": expected.isoformat()})

script = '''import {form2553Deadline} from "./webapp/src/lib/form2553Timing.ts";
const rows=JSON.parse(await Bun.stdin.text());
console.log(JSON.stringify(rows.map(x=>({...x,got:form2553Deadline(x.formation)}))));'''
result = subprocess.run(["bun", "-e", script], input=json.dumps(cases),
                        cwd=repo, capture_output=True, text=True, check=True)
rows = json.loads(result.stdout)
failed = [row for row in rows if row["got"] != row["want"]]
helper = repo / "webapp/src/lib/form2553Timing.ts"
head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo, text=True).strip()
print(json.dumps({
    "repo": str(repo), "head": head,
    "helperSha256": hashlib.sha256(helper.read_bytes()).hexdigest(),
    "sources": ["https://www.irs.gov/publications/p509",
                "https://www.irs.gov/instructions/i2553"],
    "irs2026HolidayDates": holiday_dates,
    "total": len(rows), "passed": len(rows) - len(failed), "failed": failed,
    "adjustedRawDeadlines": sum(row["raw"] != row["got"] for row in rows),
    "rows": rows,
}, indent=2))
raise SystemExit(1 if failed or len(rows) != 365 else 0)
