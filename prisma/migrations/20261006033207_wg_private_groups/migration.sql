-- CreateEnum
CREATE TYPE "WgVisibility" AS ENUM ('public', 'private');

-- CreateEnum
CREATE TYPE "WgJoinRequestStatus" AS ENUM ('pending', 'approved', 'declined');

-- AlterTable
ALTER TABLE "WorkingGroup" ADD COLUMN     "visibility" "WgVisibility" NOT NULL DEFAULT 'public';

-- CreateTable
CREATE TABLE "WgJoinRequest" (
    "id" TEXT NOT NULL,
    "wgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "message" TEXT,
    "status" "WgJoinRequestStatus" NOT NULL DEFAULT 'pending',
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WgJoinRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WgJoinRequest_wgId_status_idx" ON "WgJoinRequest"("wgId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WgJoinRequest_wgId_userId_key" ON "WgJoinRequest"("wgId", "userId");

-- AddForeignKey
ALTER TABLE "WgJoinRequest" ADD CONSTRAINT "WgJoinRequest_wgId_fkey" FOREIGN KEY ("wgId") REFERENCES "WorkingGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WgJoinRequest" ADD CONSTRAINT "WgJoinRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
