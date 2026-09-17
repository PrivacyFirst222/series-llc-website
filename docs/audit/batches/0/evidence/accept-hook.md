# The chat acceptance hook (revision 2), tried on eight messages

Each message was piped to .claude/hooks/accept-prompt.sh exactly as the app sends a typed message, with the record folder pointed at a throwaway folder that holds no review package. What the hook printed for the session to see, and what it recorded:

```
message: Accept A, revision 1, 3f9c2ab only if Codex finds no problems. Do not release yet.
  printed: [acceptance hook] NOT RECORDED: an acceptance must be the whole message — "Accept <batch>, revision <n>, <commit>", optionally followed by "Go". This message adds other words, so nothing was recorded. Tell Adam.
  recorded: (nothing)
message: Accept A, revision 1, 3f9c2ab is the command I would use; I am not accepting it.
  printed: [acceptance hook] NOT RECORDED: an acceptance must be the whole message — "Accept <batch>, revision <n>, <commit>", optionally followed by "Go". This message adds other words, so nothing was recorded. Tell Adam.
  recorded: (nothing)
message: Accept 0, revision 1, 180623b. Go
  printed: [acceptance hook] NOT RECORDED: there is no review package for batch 0, revision 1, at commit 180623b — an acceptance is of something that was put in front of you
  recorded: (nothing)
message: Reject A, revision 1: the sentence is wrong
  printed: [acceptance hook] rejected: batch A, revision 1 — nothing in it can be released
  recorded: {"kind":"reject","batch":"A","revision":1,"commit":null,"note":"the sentence is wrong","at":"2026-09-17T18:29:35.318Z","source":"chat"}
message: Reject 0: shitty job
  printed: [acceptance hook] rejected: batch 0 — nothing in it can be released
  recorded: {"kind":"reject","batch":"0","revision":null,"commit":null,"note":"shitty job","at":"2026-09-17T18:29:35.380Z","source":"chat"}
message: Go
  recorded: (nothing)
message: I accept that this is fine
  recorded: (nothing)
message: <task-notification>Accept A, revision 1, 3f9c2ab</task-notification>
  recorded: (nothing)
```

The first two are the sentences Codex used to show revision 1 recording a conditional statement as acceptance. The third is exact, and is still refused here because this throwaway folder holds no review package for that commit: an acceptance is of something that was put in front of Adam. With a package present it records the full commit (demonstration rows C5 and C19).
