# Certification Program documents

Legal documents of the Verana Certification Program. They live in their own
folder on purpose: only files directly in `legal/` are Membership Agreement
versions, and nothing here is an agreement version.

| File | What it is | Rendered at |
|---|---|---|
| `certification-policy-v1.md` | The Certification Policy: levels, assessment, validity, issuance, designations, certificators, marks, appeals, fees (Annex A), program versions (Annex B) | `/certification/policy` |
| `authorized-certificator-agreement-v1.md` | The agreement a certificator signs with the Foundation. Per-certificator fields use the same double-brace placeholders as the Membership Agreement | Not rendered; signed by hand for now |
| `candidate-terms-v1.md` | The terms a candidate accepts before the first assessment | `/certification/candidate-terms` |

## Status

All three are **drafts** for counsel review, dated 20261012. None is in force:
the policy becomes effective when published as version 1 and its digest is
anchored as the governance framework of the Verana Certification Ecosystem
(Policy, Section 15.1).

## Versioning

- Bump the version in the file name and in the title line together
  (`certification-policy-v2.md`, `CERTIFICATION POLICY v2 20270115`).
- Keep every published version in the folder. A certification is governed by
  the policy version in force on its issuance date (Policy, Section 15.3).
- The website renders the highest policy version present; the digest shown on
  the policy page is the SHA-384 of the file bytes, which is what gets anchored.

## Design source

The program design these documents implement is kept outside this repository
(Verana strategy, 2026, foundation-certification, plan.md).
