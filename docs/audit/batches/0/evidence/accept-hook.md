# The chat acceptance hook, tried on six messages

Each message was piped to .claude/hooks/accept-prompt.sh exactly as the app sends a typed message, with the record file pointed at a throwaway folder. What the hook wrote:

```
message: Accept A, revision 1, 3f9c2ab. Go
  record: {"kind": "accept", "batch": "A", "revision": 1, "commit": "3f9c2ab", "at": "2026-09-17T15:52:23.038596Z", "source": "chat"}
message: accept batch 0 r1 ABCDEF1
  record: {"kind": "accept", "batch": "0", "revision": 1, "commit": "abcdef1", "at": "2026-09-17T15:52:23.087559Z", "source": "chat"}
message: Reject A, item 8: the sentence is wrong
  record: {"kind": "reject", "batch": "A", "revision": null, "commit": null, "note": "item 8: the sentence is wrong", "at": "2026-09-17T15:52:23.135161Z", "source": "chat"}
message: Go
  record: (none)
message: I accept that this is fine
  record: (none)
message: <task-notification>Accept A, revision 1, 3f9c2ab</task-notification>
  record: (none)
```

A message that merely contains the word, a bare Go, and a harness notice write nothing.
