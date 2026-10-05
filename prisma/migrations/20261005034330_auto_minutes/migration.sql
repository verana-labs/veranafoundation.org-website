-- CreateEnum
CREATE TYPE "WgSessionSource" AS ENUM ('manual', 'ai_draft');

-- CreateEnum
CREATE TYPE "WgTranscriptStatus" AS ENUM ('awaiting_transcript', 'transcribed', 'summarized', 'awaiting_approval', 'approved', 'discarded', 'failed');

-- DropForeignKey
ALTER TABLE "WgSession" DROP CONSTRAINT "WgSession_recordedById_fkey";

-- AlterTable
ALTER TABLE "WgSchedule" ADD COLUMN     "meetAutoTranscribe" BOOLEAN,
ADD COLUMN     "meetConfigError" TEXT,
ADD COLUMN     "meetConfiguredAt" TIMESTAMP(3),
ADD COLUMN     "meetingCode" TEXT;

-- AlterTable
ALTER TABLE "WgSession" ADD COLUMN     "source" "WgSessionSource" NOT NULL DEFAULT 'manual',
ALTER COLUMN "recordedById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "WorkingGroup" ADD COLUMN     "autoMinutes" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'en';

-- CreateTable
CREATE TABLE "WgTranscript" (
    "id" TEXT NOT NULL,
    "wgId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "meetingCode" TEXT NOT NULL,
    "conferenceRecords" TEXT[],
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "language" TEXT,
    "entries" JSONB,
    "entryCount" INTEGER NOT NULL DEFAULT 0,
    "meetParticipants" JSONB,
    "summaryMd" TEXT,
    "summaryModel" TEXT,
    "summarizedAt" TIMESTAMP(3),
    "openQuestions" JSONB,
    "status" "WgTranscriptStatus" NOT NULL DEFAULT 'awaiting_transcript',
    "publishTranscript" BOOLEAN NOT NULL DEFAULT false,
    "transcriptPath" TEXT,
    "transcriptCommitSha" TEXT,
    "lastError" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "approvalRequestedAt" TIMESTAMP(3),
    "remindedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WgTranscript_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WgTranscript_sessionId_key" ON "WgTranscript"("sessionId");

-- CreateIndex
CREATE INDEX "WgTranscript_wgId_status_idx" ON "WgTranscript"("wgId", "status");

-- CreateIndex
CREATE INDEX "WgTranscript_status_nextAttemptAt_idx" ON "WgTranscript"("status", "nextAttemptAt");

-- AddForeignKey
ALTER TABLE "WgSession" ADD CONSTRAINT "WgSession_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WgTranscript" ADD CONSTRAINT "WgTranscript_wgId_fkey" FOREIGN KEY ("wgId") REFERENCES "WorkingGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WgTranscript" ADD CONSTRAINT "WgTranscript_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WgSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
