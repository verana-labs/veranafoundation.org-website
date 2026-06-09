// The active Membership Agreement version (catalog row). Content + integrity are
// handled by agreement-versions.ts; this is the thin lookup used by pages that
// only need the active version label.
export { getActiveVersion as getActiveAgreement } from "@/app/lib/agreement-versions";
