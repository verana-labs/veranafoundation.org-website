-- Rework AgreementDocument from a PDF-URL pointer into a version-file catalog.
-- Pre-existing rows are obsolete PDF-URL config; clear them so the NOT NULL
-- columns below can be added. The seed re-activates a legal/ file afterwards.
DELETE FROM "AgreementDocument";
ALTER TABLE "AgreementDocument" DROP COLUMN "url";
ALTER TABLE "AgreementDocument" ADD COLUMN "filename" TEXT NOT NULL;
ALTER TABLE "AgreementDocument" ADD COLUMN "hashAlgo" TEXT NOT NULL DEFAULT 'sha384';
ALTER TABLE "AgreementDocument" ALTER COLUMN "hash" SET NOT NULL;
CREATE UNIQUE INDEX "AgreementDocument_filename_key" ON "AgreementDocument"("filename");
