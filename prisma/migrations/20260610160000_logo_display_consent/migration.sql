-- Explicit consent (asked at logo upload) to display the organization's logo
-- on veranafoundation.org.
ALTER TABLE "Member" ADD COLUMN "logoDisplayConsent" BOOLEAN NOT NULL DEFAULT false;
