# Batch 36 verification

The browser renders the actual AdminDashboard and uses authenticated Hono routes against a throwaway offline Postgres database. The saved results include the server isolation proof. No customer, provider, or publication is involved.

19/19 targeted checks passed, including 205 newer completed history records, old active records, company-scoped services, all five completed pages, search, invalid input/access, real certificate upload, real browser fulfillment, details access, narrow-screen layout, and failed-service recovery. Screenshots show the actual components on desktop, tablet and mobile. Initial test setup mistakes (admin cookie, PDF package name and the detail panel being a panel rather than a dialog) were corrected before this successful run; no product defect was inferred from them.

The mandatory server suite runs this check at `batch36 office workflow`. The full review separately runs it against the pre-change source, carrying only its test files, to prove it detects the missing workflow.

React review: stable query keys include queue, search and page; service lookup is limited to the returned company IDs; no completion cards are shown while service loading failed; tab controls use the existing accessible Tabs component; pagination buttons have explicit text and disabled boundaries. Product status values are unchanged; the queue is derived from the saved filings and outstanding work.
