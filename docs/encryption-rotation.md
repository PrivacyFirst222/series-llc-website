# Encryption keys and safe rotation

Stored S-election forms, manually fulfilled tax PDFs and EIN letters use
AES-256-GCM authenticated encryption. The new taxpayer-number values use the
same versioned key ring. Downloads decrypt only after the existing session and
ownership checks. Encryption failure refuses storage; it never falls back to
plaintext. Local offline fixtures use test keys; production requires explicit
configuration.

`DOCUMENT_ENCRYPTION_KEYS` is JSON mapping key ids to base64-encoded, random
32-byte keys. `DOCUMENT_ENCRYPTION_ACTIVE_KEY` names the key used for new writes.
Keep a secure recovery copy independently of database and document backups.
Login-session secret changes do not change these encryption keys.

1. Pause order/document writes during a planned maintenance window. Retain every
   old encryption key. For legacy v1 taxpayer values, retain the old session
   secret as `LEGACY_SESSION_SECRET` if SESSION_SECRET has changed.
2. Add the new random key to the ring and select its id as active. Do not delete
   old keys. Confirm the same ring is installed everywhere serving the app.
3. From webapp run `bun run scripts/rotate-encryption.ts --maintenance-confirmed`.
   It decrypts each still-live taxpayer number, re-encrypts and compares it;
   updates only unchanged source values; re-encrypts retained sensitive files
   in place and reads them back; and refreshes/verifies mirrored copies.
   A missing key, changed row, failed file, or incomplete mirror refuses success.
4. Complete a full backup and restore rehearsal against a fresh database, using
   a pre-rotation snapshot as well as the new snapshot. Confirm every retained
   document is decryptable and every pending EIN number still works before
   removing an old key from the live deployment. Keep legacy session keys until no v1 value remains.
   Retain every historical document key in the separate recovery key ring for as
   long as retained backups may reference it. A rehearsal of one snapshot does
   not prove that every older mirrored copy has been re-encrypted.
5. Resume writes. Keep the complete historical recovery key ring current. Never rotate keys by
   overwriting an environment secret and assuming old ciphertext is disposable.

Existing test backups and test copies are not migrated or cleaned up by this
batch. Production keys are not changed by its local implementation or review.
