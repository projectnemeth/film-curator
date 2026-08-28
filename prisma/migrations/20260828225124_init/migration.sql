-- CreateEnum
CREATE TYPE "Mode" AS ENUM ('FAMILY', 'ADULT');

-- CreateEnum
CREATE TYPE "OverrideDecision" AS ENUM ('APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TasteRatingValue" AS ENUM ('DISLIKED', 'LIKED', 'LOVED', 'NOT_SEEN', 'TOO_INAPPROPRIATE');

-- CreateTable
CREATE TABLE "Title" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL DEFAULT 'default',
    "tmdbId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER,
    "posterPath" TEXT,
    "overview" TEXT,
    "mpaaRating" TEXT,
    "providers" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Title_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentScore" (
    "id" TEXT NOT NULL,
    "titleId" TEXT NOT NULL,
    "violence" INTEGER NOT NULL,
    "language" INTEGER NOT NULL,
    "sexNudity" INTEGER NOT NULL,
    "scariness" INTEGER NOT NULL,
    "isUnrated" BOOLEAN NOT NULL DEFAULT false,
    "isNC17" BOOLEAN NOT NULL DEFAULT false,
    "sourceNotes" TEXT,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModeSettings" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL DEFAULT 'default',
    "mode" "Mode" NOT NULL,
    "maxViolence" INTEGER NOT NULL,
    "maxLanguage" INTEGER NOT NULL,
    "maxSexNudity" INTEGER NOT NULL,
    "maxScariness" INTEGER NOT NULL,
    "allowUnrated" BOOLEAN NOT NULL DEFAULT false,
    "allowNC17" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ModeSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Override" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL DEFAULT 'default',
    "titleId" TEXT NOT NULL,
    "decision" "OverrideDecision" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Override_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TasteRating" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL DEFAULT 'default',
    "titleId" TEXT NOT NULL,
    "rating" "TasteRatingValue" NOT NULL,
    "ratedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TasteRating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Title_familyId_tmdbId_key" ON "Title"("familyId", "tmdbId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentScore_titleId_key" ON "ContentScore"("titleId");

-- CreateIndex
CREATE UNIQUE INDEX "ModeSettings_familyId_mode_key" ON "ModeSettings"("familyId", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "Override_familyId_titleId_key" ON "Override"("familyId", "titleId");

-- CreateIndex
CREATE UNIQUE INDEX "TasteRating_familyId_titleId_key" ON "TasteRating"("familyId", "titleId");

-- AddForeignKey
ALTER TABLE "ContentScore" ADD CONSTRAINT "ContentScore_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "Title"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Override" ADD CONSTRAINT "Override_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "Title"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TasteRating" ADD CONSTRAINT "TasteRating_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "Title"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
