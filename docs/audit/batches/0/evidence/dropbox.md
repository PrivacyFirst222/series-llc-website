# Dropbox before and after a Word generation

The generator was run for real in this repository (2026-09-17T15:46:58.906Z), regenerating all 12 Word documents (log: word-generator.log). The Dropbox folder was read before and after: every file, by relative path and SHA-256 of its contents.

- files before: 54; files after: 54
- added: none
- removed: none
- contents changed: none
- paths and content hashes identical: true
- modification times identical (supplemental): true

The 12 regenerated documents in docs/word/ differed byte for byte from the committed ones although no master had changed: the generator is not byte-stable. That is why release copies the COMMITTED, reviewed files to Dropbox and never regenerates. The regenerated files were discarded (git checkout -- docs/word).
