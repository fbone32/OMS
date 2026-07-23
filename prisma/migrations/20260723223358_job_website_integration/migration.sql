-- DropForeignKey
ALTER TABLE "JobOpening" DROP CONSTRAINT "JobOpening_createdByUserId_fkey";

-- AlterTable
ALTER TABLE "Candidate" ADD COLUMN     "coverLetter" TEXT,
ADD COLUMN     "cvDataUrl" TEXT,
ADD COLUMN     "cvFileName" TEXT,
ADD COLUMN     "cvMimeType" TEXT,
ADD COLUMN     "cvSizeBytes" INTEGER,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'OMS';

-- AlterTable
ALTER TABLE "JobOpening" ADD COLUMN     "externalRef" TEXT,
ADD COLUMN     "externalSource" TEXT,
ALTER COLUMN "createdByUserId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Candidate_email_jobOpeningId_key" ON "Candidate"("email", "jobOpeningId");

-- CreateIndex
CREATE UNIQUE INDEX "JobOpening_externalRef_key" ON "JobOpening"("externalRef");

-- AddForeignKey
ALTER TABLE "JobOpening" ADD CONSTRAINT "JobOpening_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

