/*
  Warnings:

  - You are about to drop the `ModeSettings` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[familyId,titleId,mode]` on the table `TasteRating` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "TasteRatingValue" ADD VALUE 'NOT_INTERESTED';

-- DropIndex
DROP INDEX "TasteRating_familyId_titleId_key";

-- AlterTable
ALTER TABLE "TasteRating" ADD COLUMN     "mode" "Mode" NOT NULL DEFAULT 'FAMILY';

-- DropTable
DROP TABLE "ModeSettings";

-- CreateTable
CREATE TABLE "RankingCache" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL DEFAULT 'default',
    "mode" "Mode" NOT NULL,
    "inputFingerprint" TEXT NOT NULL,
    "rankedIds" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RankingCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RankingCache_familyId_mode_key" ON "RankingCache"("familyId", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "TasteRating_familyId_titleId_mode_key" ON "TasteRating"("familyId", "titleId", "mode");
