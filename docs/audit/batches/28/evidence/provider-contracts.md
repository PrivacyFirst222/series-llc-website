# Provider contracts verified before implementation

Read in the browser on 21 September 2026. No provider account action was performed.

## Square card storage
Source: https://developer.squareup.com/reference/square/cards-api/create-card

> Adds a card on file to an existing merchant.

The endpoint is POST /v2/cards. Required request fields are idempotency_key, source_id and card. source_id accepts a card nonce or a payment ID. The documented example includes customer_id under card. The response supplies card ID, enabled, brand, last four digits and prepaid_type. This storage operation is separate from the Payments endpoint.

The Web Payments SDK guide opened earlier: https://developer.squareup.com/docs/web-payments/sca-charge-and-store-card-on-file

> Set intent to STORE, customerInitiated to true, and sellerKeyedIn to false.

## Dropbox listing
Source: https://docs.dropboxapi.com/dropbox-api/api-reference/user-endpoints/files/list-folder

POST /2/files/list_folder requires files.metadata.read. A true has_more requires continuing with the returned cursor; stopping after the first page is incomplete. Entries include path_lower and a type tag. Listing errors are not evidence of an empty journal. The independent journal must already be initialized for restore; restore must not initialize a missing journal.

## Dropbox compare-and-swap journal
Source: https://docs.dropboxapi.com/dropbox-api/api-reference/user-endpoints/files/upload

The upload documentation's `update` mode requires the revision obtained from the prior metadata. `strict_conflict: true` refuses a mismatched revision or deleted target; `autorename: false` prevents creating a second journal under a different name. The implementation reads the download response's revision, then uses that exact revision when appending. Local fixture operations use a lock and atomic rename. No live Dropbox writes were made during verification.
