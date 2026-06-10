-- Drop the unused pre-incorporation `provisional` flag from Membership.
ALTER TABLE "Membership" DROP COLUMN "provisional";
