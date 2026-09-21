# Batch 23 office UI source and read scope

Governing approved proposal (Adam approved all five Batch23 items with “5. Go. Approve all”):

1. “Show ‘We couldn’t load the email history. Please try again’ with a Retry button. Give individual emails the same retry behavior. Show the empty-history message only when a successful lookup actually finds no emails.”
2. “Display ‘We couldn’t load the EIN application details’ with Retry. Show ‘not yet provided’ only after successfully loading the application and confirming the number is missing. Present the IRS-assistant answer list only after its details load successfully.”

Read whole, before product edits, baseline 3577d25:
- webapp/src/pages/admin/AdminDashboard.tsx: 683/683 lines.
- webapp/src/pages/admin/ServiceOrdersSection.tsx: 469/469 lines.

Existing source: AdminDashboard lines123–130 falls through from list.isPending to `(list.data ?? []).length === 0`; individual email lines105–125 uses `one.data ? (...) : Loading…` with no error branch.
ServiceOrdersSection lines306–322 uses `detailQuery.isLoading ? "…" : detailQuery.data?.tin ? ... : "— not yet provided —"`, and the assistant is controlled by `detailQuery.data?.details.responsibleName` alone.

Scope: only the two approved load-error corrections; existing fulfillment permissions, missing-detail meanings after success, uploaded documents, and IRS answer content remain unchanged.

USER WALK — office opening client email history:
1. Opens Office → Clients → Emails.
2. A failed lookup shows an error and Retry, not a statement that no email was sent.
3. Retries; opens a recorded email; retries its body if retrieval fails.
Expects: successful empty results and failed retrieval are visibly distinct.

USER WALK — office preparing an EIN:
1. Opens an EIN service order.
2. A failed application retrieval shows an error and Retry, not a statement that the client omitted their SSN.
3. Retries successfully and reads the actual supplied details and assistant answer list.
Expects: no fabricated absent answer from a failed load, and ordinary fulfillment unchanged.
