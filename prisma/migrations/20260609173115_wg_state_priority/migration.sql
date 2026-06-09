-- WorkingGroup state (enabled/disabled) + priority for public ordering.
CREATE TYPE "WorkingGroupState" AS ENUM ('enabled', 'disabled');
ALTER TABLE "WorkingGroup" ADD COLUMN "state" "WorkingGroupState" NOT NULL DEFAULT 'enabled';
ALTER TABLE "WorkingGroup" ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 0;
