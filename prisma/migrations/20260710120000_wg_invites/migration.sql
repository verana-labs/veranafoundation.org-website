-- CreateEnum
CREATE TYPE "WgInviteRole" AS ENUM ('lead', 'participant');

-- CreateTable
CREATE TABLE "WgInvite" (
    "id" TEXT NOT NULL,
    "wgId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "WgInviteRole" NOT NULL,
    "invitedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "WgInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WgInvite_wgId_email_key" ON "WgInvite"("wgId", "email");

-- CreateIndex
CREATE INDEX "WgInvite_email_idx" ON "WgInvite"("email");

-- AddForeignKey
ALTER TABLE "WgInvite" ADD CONSTRAINT "WgInvite_wgId_fkey" FOREIGN KEY ("wgId") REFERENCES "WorkingGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
