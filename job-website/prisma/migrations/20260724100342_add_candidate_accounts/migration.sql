-- AlterTable
ALTER TABLE "JobApplication" ADD COLUMN     "candidateAccountId" TEXT;

-- CreateTable
CREATE TABLE "CandidateAccount" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "verificationTokenHash" TEXT,
    "verificationTokenExpiresAt" TIMESTAMP(3),
    "cvFileName" TEXT,
    "cvMimeType" TEXT,
    "cvSizeBytes" INTEGER,
    "cvDataUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedJob" (
    "id" TEXT NOT NULL,
    "candidateAccountId" TEXT NOT NULL,
    "jobListingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CandidateAccount_email_key" ON "CandidateAccount"("email");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateAccount_verificationTokenHash_key" ON "CandidateAccount"("verificationTokenHash");

-- CreateIndex
CREATE INDEX "SavedJob_jobListingId_idx" ON "SavedJob"("jobListingId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedJob_candidateAccountId_jobListingId_key" ON "SavedJob"("candidateAccountId", "jobListingId");

-- CreateIndex
CREATE INDEX "JobApplication_candidateAccountId_idx" ON "JobApplication"("candidateAccountId");

-- AddForeignKey
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_candidateAccountId_fkey" FOREIGN KEY ("candidateAccountId") REFERENCES "CandidateAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedJob" ADD CONSTRAINT "SavedJob_candidateAccountId_fkey" FOREIGN KEY ("candidateAccountId") REFERENCES "CandidateAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedJob" ADD CONSTRAINT "SavedJob_jobListingId_fkey" FOREIGN KEY ("jobListingId") REFERENCES "JobListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
