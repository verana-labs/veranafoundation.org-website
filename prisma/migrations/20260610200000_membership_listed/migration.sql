-- Admin-curated flag: membership appears on the public /members directory.
ALTER TABLE "Membership" ADD COLUMN "listed" BOOLEAN NOT NULL DEFAULT false;
