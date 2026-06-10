-- Audit: which versioned fee schedule priced this invoice (null on legacy rows).
ALTER TABLE "Invoice" ADD COLUMN "feeScheduleVersion" TEXT;
