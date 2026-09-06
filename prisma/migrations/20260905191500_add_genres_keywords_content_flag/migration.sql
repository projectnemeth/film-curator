-- AlterTable
ALTER TABLE "Title" ADD COLUMN     "genres" TEXT[],
ADD COLUMN     "keywords" TEXT[],
ADD COLUMN     "contentFlag" TEXT;

-- Rows that predate these columns come back NULL rather than empty, which
-- the exclusion filter would read as a missing list. Normalize them.
UPDATE "Title" SET "genres" = '{}' WHERE "genres" IS NULL;
UPDATE "Title" SET "keywords" = '{}' WHERE "keywords" IS NULL;
