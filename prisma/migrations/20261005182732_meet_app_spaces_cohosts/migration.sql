-- AlterTable
ALTER TABLE "WgSchedule" ADD COLUMN     "meetMembersError" TEXT,
ADD COLUMN     "meetMembersSyncedAt" TIMESTAMP(3),
ADD COLUMN     "meetSpaceName" TEXT;
