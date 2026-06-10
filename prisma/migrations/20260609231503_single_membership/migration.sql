-- One membership per member (1:1): make Membership.memberId unique.
DROP INDEX "Membership_memberId_idx";
CREATE UNIQUE INDEX "Membership_memberId_key" ON "Membership"("memberId");
