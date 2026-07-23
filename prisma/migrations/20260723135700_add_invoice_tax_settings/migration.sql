/*
  Warnings:

  - Added the required column `totalAmount` to the `Invoice` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
-- totalAmount is added nullable first, backfilled from the existing
-- pre-tax `amount` for any invoices already in this table (this app has no
-- real production Invoice rows yet — this is a pre-launch, not a live-data
-- migration — so "no tax breakdown" is the honest state for anything
-- created before this migration), then made NOT NULL.
ALTER TABLE "Invoice" ADD COLUMN     "covidLevyAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "getfundAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "nhilAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "taxExempt" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "totalAmount" DECIMAL(12,2),
ADD COLUMN     "vatAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

UPDATE "Invoice" SET "totalAmount" = "amount" WHERE "totalAmount" IS NULL;

ALTER TABLE "Invoice" ALTER COLUMN "totalAmount" SET NOT NULL;

-- CreateTable
CREATE TABLE "InvoiceTaxSettings" (
    "id" TEXT NOT NULL,
    "vatRatePct" DECIMAL(5,2) NOT NULL,
    "nhilRatePct" DECIMAL(5,2) NOT NULL,
    "getfundRatePct" DECIMAL(5,2) NOT NULL,
    "covidLevyRatePct" DECIMAL(5,2) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "updatedByUserId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceTaxSettings_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "InvoiceTaxSettings" ADD CONSTRAINT "InvoiceTaxSettings_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
