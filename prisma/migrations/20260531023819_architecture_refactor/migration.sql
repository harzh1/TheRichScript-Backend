/*
  Warnings:

  - The `recurringFrequency` column on the `Goal` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "Goal" ADD COLUMN     "lastFundedAt" TIMESTAMP(3),
ADD COLUMN     "sourceAssetId" TEXT,
DROP COLUMN "recurringFrequency",
ADD COLUMN     "recurringFrequency" TEXT;

-- AlterTable
ALTER TABLE "PlannedExpense" ADD COLUMN     "lastFundedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "UserCategory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserCategory_userId_name_key" ON "UserCategory"("userId", "name");

-- AddForeignKey
ALTER TABLE "UserCategory" ADD CONSTRAINT "UserCategory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_sourceAssetId_fkey" FOREIGN KEY ("sourceAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
