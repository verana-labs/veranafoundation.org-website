-- Timestamp of when a WorkingGroup last became disabled (admin 5-min grace window).
ALTER TABLE "WorkingGroup" ADD COLUMN "disabledAt" TIMESTAMP(3);
