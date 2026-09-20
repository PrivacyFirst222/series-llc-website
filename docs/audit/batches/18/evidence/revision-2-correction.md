# Revision 2 work-order correction — pending Adam's decision

Revision 1 remains frozen and authorized. It has not been committed, implemented, accepted or published. Do not rewrite it.

The preparatory script froze citation assertions before running the strengthened citation check and all eight assemblers. That was Codex's error. The corrected candidate is retained outside the repository as batch18-r2-candidate.json.

Two corrections within the already-approved scope:

1. Both multi-member S-corporation forms cite Internal Revenue Code section 1377. Include it in their reference lists.
2. Six federal-citation edits had mistakenly included the following generated-document footer in the replacement range. Keep the federal references in the draft reference paragraph; preserve the separate [TITLE]/[EDITION] footer unchanged. The other two forms need only their Florida citation corrections.

The product sources are corrected. All eight assemblers and actual PDFs now pass the focused checks. The fact checker verifies Florida and federal citation coverage. No operative provision was changed (the provision map also passed).

A prior assertion projection passes and the candidate's 18 records pass static replay. The next step requires Adam's actual rejection of revision 1, then authorization of revision 2; no rejection is fabricated.

## Corrected citation paragraphs

### webapp/server/templates-oa-member-s.md

*Form document — [COMPANY NAME], LLC Operating Agreement (Member-Managed / S Corporation), v1 draft. Statutory citations in this form: ss. 48.062, 605.0102, 605.0302, 605.0502, 605.0503, 605.0702, 605.2101, 605.2103, 605.2107, 605.2201, 605.2301, 605.2302, 605.2303, 605.2304, 605.2401, 605.2602, 605.2605, 605.2607, 605.2802, 605.04091, 711.50, 711.501, 711.512, Fla. Stat.; 11 U.S.C. §365; In re Soderstrom, 484 B.R. 874 (M.D. Fla. 2013). Internal Revenue Code sections: 1361, 1362, 1366, 1377, 1378.*

### webapp/server/templates-oa-member-single-s.md

*Form document — [COMPANY NAME], LLC Operating Agreement (Member-Managed, Single Member / S Corporation), v1 draft. Statutory citations in this form: ss. 48.062, 605.0102, 605.0302, 605.0602, 605.2101, 605.2103, 605.2107, 605.2201, 605.2301, 605.2302, 605.2303, 605.2304, 605.2401, 605.2602, 605.2605, 605.2607, 605.2802, 711.50, 711.501, 711.512, Fla. Stat. Internal Revenue Code sections: 1361, 1362, 1378.*

### webapp/server/templates-oa-member-single.md

*Form document — [COMPANY NAME], LLC Operating Agreement (Member-Managed, Single Member / Disregarded Entity), v1 draft. Statutory citations in this form: ss. 48.062, 605.0102, 605.0302, 605.0602, 605.2101, 605.2103, 605.2107, 605.2201, 605.2301, 605.2302, 605.2303, 605.2304, 605.2401, 605.2602, 605.2605, 605.2607, 605.2802, 711.50, 711.501, 711.512, Fla. Stat.*

### webapp/server/templates-oa-member.md

*Form document — [COMPANY NAME], LLC Operating Agreement (Member-Managed, Multiple Members / Partnership Taxation), v1 draft. Statutory citations in this form: ss. 48.062, 605.0102, 605.0302, 605.0502, 605.0503, 605.0702, 605.2101, 605.2103, 605.2107, 605.2201, 605.2301, 605.2302, 605.2303, 605.2304, 605.2401, 605.2602, 605.2605, 605.2607, 605.2802, 605.04091, 711.50, 711.501, 711.512, Fla. Stat.; 11 U.S.C. §365; In re Soderstrom, 484 B.R. 874 (M.D. Fla. 2013). Internal Revenue Code sections: 704, 754, 6221, 6223, 6226.*

### webapp/server/templates-oa-multi.md

*Form document — [COMPANY NAME], LLC Operating Agreement (Manager-Managed, Multiple Members / Partnership Taxation), v1 draft. Statutory citations in this form: ss. 48.062, 605.0102, 605.0302, 605.0502, 605.0503, 605.0702, 605.2101, 605.2103, 605.2107, 605.2201, 605.2301, 605.2302, 605.2303, 605.2304, 605.2401, 605.2602, 605.2605, 605.2607, 605.2802, 605.04074, 605.04091, 711.50, 711.501, 711.512, Fla. Stat.; 11 U.S.C. §365; In re Soderstrom, 484 B.R. 874 (M.D. Fla. 2013). Internal Revenue Code sections: 704, 754, 6221, 6223, 6226.*

### webapp/server/templates-oa-s.md

*Form document — [COMPANY NAME], LLC Operating Agreement (Manager-Managed / S Corporation), v1 draft. Statutory citations in this form: ss. 48.062, 605.0102, 605.0302, 605.0502, 605.0503, 605.0702, 605.2101, 605.2103, 605.2107, 605.2201, 605.2301, 605.2302, 605.2303, 605.2304, 605.2401, 605.2602, 605.2605, 605.2607, 605.2802, 605.04074, 605.04091, 711.50, 711.501, 711.512, Fla. Stat.; 11 U.S.C. §365; In re Soderstrom, 484 B.R. 874 (M.D. Fla. 2013). Internal Revenue Code sections: 1361, 1362, 1366, 1377, 1378.*

### webapp/server/templates-oa-single-s.md

*Form document — [COMPANY NAME], LLC Operating Agreement (Manager-Managed, Single Member / S Corporation), v1 draft. Statutory citations in this form: ss. 48.062, 605.0102, 605.0302, 605.0602, 605.2101, 605.2103, 605.2107, 605.2201, 605.2301, 605.2302, 605.2303, 605.2304, 605.2401, 605.2602, 605.2605, 605.2607, 605.2802, 605.04074, 711.50, 711.501, 711.512, Fla. Stat. Internal Revenue Code sections: 1361, 1362, 1378.*

### webapp/server/templates-oa-single.md

*Form document — [COMPANY NAME], LLC Operating Agreement (Manager-Managed, Single Member / Disregarded Entity), v1 draft. Statutory citations in this form: ss. 48.062, 605.0102, 605.0302, 605.0602, 605.2101, 605.2103, 605.2107, 605.2201, 605.2301, 605.2302, 605.2303, 605.2304, 605.2401, 605.2602, 605.2605, 605.2607, 605.2802, 605.04074, 711.50, 711.501, 711.512, Fla. Stat.*

## Subsequent owner decision — 20 September 2026

Adam: "Reject Batch 18 revision 1; proceed with revision 2." The earlier pending status above is historical. The actual rejection was recorded through accept.ts and batch.ts before replacing the work order. Revision 1 remains intact in revisions/r1.json and evidence/revision-1-work-order.md. Item 42 assertions additionally require removal of the old 2025 URLs, not only presence of their shared prefix.
