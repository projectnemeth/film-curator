/*
  Warnings:

  - You are about to drop the `Override` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Override" DROP CONSTRAINT "Override_titleId_fkey";

-- DropTable
DROP TABLE "Override";

-- DropEnum
DROP TYPE "OverrideDecision";
