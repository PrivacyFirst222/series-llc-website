# Batch zero — one assertion of each kind, passing and failing

Run 2026-09-17T15:49:54Z in this repository. The server checks were run first against an isolated API that reported `offline = true; live connections: none`; all 664 passed and wrote their results by label. The page assertion opens a fresh production build on that isolated site in a real browser.

## The three in extra-assertions.json (a page, a master with its Word document, a named server check) — must pass

```
assertions: 3 replayed (1 page, 1 document, 1 behaviour), 0 failed
exit 0
```

## The three in evidence/wrong-assertions.json — each must fail for its own reason

```
assertions: 3 replayed (1 page, 1 document, 1 behaviour), 3 failed
  - extra (wrong-assertions.json): the page /faq does not show "This sentence is not on the FAQ page"
  - extra (wrong-assertions.json): the Word document "FPSLLC Operating Agreement Instructions - DRAFT.docx" does not say "A sentence the Word document does not contain" — it was not regenerated from its master
  - extra (wrong-assertions.json): the server check "a check that was removed from the suite" is missing from the results — skipped or removed counts as failed
exit 1
```

## The passing three again, with NO results supplied — the named check must count as failed

```
assertions: 3 replayed (1 page, 1 document, 1 behaviour), 1 failed
  - extra (extra-assertions.json): the server check "the client signs in" — no results were supplied, so it did not run; that counts as failed
exit 1
```

Found while building this: a page assertion compares what the reader sees, so a label the stylesheet shows in capitals reads in capitals ("QUESTIONS, ANSWERED"), not as typed in the source.
