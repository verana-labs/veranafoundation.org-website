-- CreateEnum
CREATE TYPE "WgRegion" AS ENUM ('global', 'europe', 'latin_america', 'north_america', 'africa', 'asia_pacific');

-- AlterTable
ALTER TABLE "WorkingGroup" ADD COLUMN     "region" "WgRegion" NOT NULL DEFAULT 'global';
