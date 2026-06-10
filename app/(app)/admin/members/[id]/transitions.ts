// Admin-allowed membership status transitions (shared by the server action that
// enforces them and the card that offers them in its ⋮ menu).

export type MembershipStatus =
  | "pending"
  | "active"
  | "past_due"
  | "suspended"
  | "expired"
  | "cancelled";

export const MEMBERSHIP_TRANSITIONS: Record<MembershipStatus, MembershipStatus[]> = {
  pending: ["active", "cancelled"],
  active: ["suspended", "expired", "cancelled"],
  past_due: ["active", "suspended", "cancelled"],
  suspended: ["active", "expired", "cancelled"],
  expired: ["active"],
  cancelled: ["active"],
};

/** Action label for transitioning *to* a given status. */
export const MEMBERSHIP_STATUS_LABEL: Record<MembershipStatus, string> = {
  pending: "Mark pending",
  active: "Activate",
  past_due: "Mark past due",
  suspended: "Suspend",
  expired: "Mark expired",
  cancelled: "Cancel",
};
