# Coordinator route verification

The retained route-probe.ts starts the real Hono app in a throwaway offline database, creates synthetic sessions/company/OA records, and exercises the actual client amendment and office formation-document upload routes. It then downloads the saved PDFs using the real portal document-download route and extracts their text. No real integration is enabled; global fetch is refused after loading the offline app. Temporary data is removed.

The final run, routes-green-final.log, passes all seven checks: bracketed company and signer text reaches the stored/downloaded amendment, and the office upload creates a stored/downloadable Statement with the literal company name. No encoded text leaks into these outputs.

The initial probe was launched from the repository root without the application Markdown loader. Bun therefore imported Markdown as HTML, and the amendment template parser refused its missing raw footer. This was a probe setup failure, not a product defect or a red reproduction. The final run uses the webapp working directory and explicit `--loader .md:text`, matching the application's text-loader configuration. The malformed-setup output is retained separately.

Reproduce from webapp, using an installed Python with pypdf/pdfplumber on PATH:

`bun --loader .md:text ../../evidence-independent/route-probe.ts .. ../../evidence-independent/routes-green-final`

Coordinator also read the complete product diff and opened final rendered Word Manager S Exhibit A page25, site Manual physical page16, and ordinary series-consent page1 independently. Full rendered coverage is attributed in the individual reports, not claimed as a second complete reading by the coordinator.
