-- CreateEnum
CREATE TYPE "WgSessionStatus" AS ENUM ('draft', 'published');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "displayName" TEXT;

-- AlterTable: add slug nullable, backfill from name (kebab-case, de-duped by id
-- suffix on collision), then enforce NOT NULL.
ALTER TABLE "WorkingGroup" ADD COLUMN     "slug" TEXT;
UPDATE "WorkingGroup" SET "slug" = trim(both '-' from regexp_replace(lower("name"), '[^a-z0-9]+', '-', 'g'));
UPDATE "WorkingGroup" w SET "slug" = w."slug" || '-' || substr(w."id", 1, 6)
  WHERE EXISTS (SELECT 1 FROM "WorkingGroup" o WHERE o."slug" = w."slug" AND o."id" < w."id");
ALTER TABLE "WorkingGroup" ALTER COLUMN "slug" SET NOT NULL;

-- CreateTable
CREATE TABLE "WgLead" (
    "id" TEXT NOT NULL,
    "wgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WgLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WgParticipant" (
    "id" TEXT NOT NULL,
    "wgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "WgParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WgSchedule" (
    "id" TEXT NOT NULL,
    "wgId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "timezone" TEXT NOT NULL,
    "rrule" TEXT NOT NULL,
    "googleEventId" TEXT,
    "meetLink" TEXT,
    "syncedAt" TIMESTAMP(3),
    "syncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WgSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WgScheduleException" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "originalStart" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WgScheduleException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WgSession" (
    "id" TEXT NOT NULL,
    "wgId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "status" "WgSessionStatus" NOT NULL DEFAULT 'draft',
    "notesMd" TEXT NOT NULL DEFAULT '',
    "recordedById" TEXT NOT NULL,
    "notesPath" TEXT,
    "notesCommitSha" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WgSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WgSessionAttendee" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,

    CONSTRAINT "WgSessionAttendee_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WgLead_userId_idx" ON "WgLead"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WgLead_wgId_userId_key" ON "WgLead"("wgId", "userId");

-- CreateIndex
CREATE INDEX "WgParticipant_userId_idx" ON "WgParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WgParticipant_wgId_userId_key" ON "WgParticipant"("wgId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "WgSchedule_wgId_key" ON "WgSchedule"("wgId");

-- CreateIndex
CREATE UNIQUE INDEX "WgScheduleException_scheduleId_originalStart_key" ON "WgScheduleException"("scheduleId", "originalStart");

-- CreateIndex
CREATE INDEX "WgSession_wgId_status_idx" ON "WgSession"("wgId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WgSession_wgId_occurredAt_key" ON "WgSession"("wgId", "occurredAt");

-- CreateIndex
CREATE INDEX "WgSessionAttendee_sessionId_idx" ON "WgSessionAttendee"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkingGroup_slug_key" ON "WorkingGroup"("slug");

-- AddForeignKey
ALTER TABLE "WgLead" ADD CONSTRAINT "WgLead_wgId_fkey" FOREIGN KEY ("wgId") REFERENCES "WorkingGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WgLead" ADD CONSTRAINT "WgLead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WgParticipant" ADD CONSTRAINT "WgParticipant_wgId_fkey" FOREIGN KEY ("wgId") REFERENCES "WorkingGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WgParticipant" ADD CONSTRAINT "WgParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WgSchedule" ADD CONSTRAINT "WgSchedule_wgId_fkey" FOREIGN KEY ("wgId") REFERENCES "WorkingGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WgScheduleException" ADD CONSTRAINT "WgScheduleException_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "WgSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WgSession" ADD CONSTRAINT "WgSession_wgId_fkey" FOREIGN KEY ("wgId") REFERENCES "WorkingGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WgSession" ADD CONSTRAINT "WgSession_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WgSessionAttendee" ADD CONSTRAINT "WgSessionAttendee_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WgSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

