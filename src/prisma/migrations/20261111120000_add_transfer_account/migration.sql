-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "transferAccountId" TEXT;

-- CreateIndex
CREATE INDEX "Transaction_userId_transferAccountId_idx" ON "Transaction"("userId", "transferAccountId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_transferAccountId_fkey" FOREIGN KEY ("transferAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
