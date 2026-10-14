# Certification Program documents

Legal documents of the Verana Certification Program. They live in their own
folder on purpose: only files directly in `legal/` are Membership Agreement
versions, and nothing here is an agreement version.

| File | What it is | Rendered at |
|---|---|---|
| `certification-policy-v2.md` | The Certification Policy: levels, assessment, validity, issuance, designations, certificators, marks, appeals, fees (Annex A), program versions (Annex B). Latest draft. | `/certification/policy` |
| `candidate-terms-v2.md` | The terms a candidate accepts before the first assessment. Latest draft. | `/certification/candidate-terms` |
| `authorized-certificator-agreement-v2.md` | The agreement a certificator signs with the Foundation. Per-certificator fields use the same double-brace placeholders as the Membership Agreement. Latest draft. | Not rendered; signed by hand for now |
| `certification-policy-v1.md` | Earlier policy draft (20261012). Kept for the version history. | Superseded by v2 on the public page |
| `candidate-terms-v1.md` | Earlier candidate terms draft (20261012). Kept for the version history. | Superseded by v2 on the public page |
| `authorized-certificator-agreement-v1.md` | Earlier certificator agreement draft (20261012). Kept for the version history. | Not rendered |

## Status

The current drafts are **v2**, dated 20261014. None is in force: the policy
becomes effective when published as version 2 on veranafoundation.org and its
digest is anchored as the governance framework of the Verana Certification
Ecosystem (Policy, Section 15.1). Version 1 was never published as effective.

## Versioning

- Bump the version in the file name and in the title line together
  (`certification-policy-v2.md`, `CERTIFICATION POLICY v2 20261014`).
- Keep every prior version in the folder. A certification is governed by
  the policy version in force on its issuance date (Policy, Section 15.3).
- The website renders the highest policy and candidate-terms version present;
  the digest shown on the policy page is the SHA-384 of the file bytes, which
  is what gets anchored. The public URLs do not change when a new version is
  added.

## Design source

The program design these documents implement is kept outside this repository
(Verana strategy, 2026, foundation-certification, plan.md).
