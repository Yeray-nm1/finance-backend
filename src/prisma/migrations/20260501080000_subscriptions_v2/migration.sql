-- CreateEnum
CREATE TYPE "SubscriptionFrequency_new" AS ENUM ('weekly', 'biweekly', 'monthly', 'bimonthly', 'quarterly', 'yearly');
ALTER TABLE "Subscription" ALTER COLUMN "frequency" TYPE "SubscriptionFrequency_new" USING ("frequency"::text::"SubscriptionFrequency_new");
DROP TYPE "SubscriptionFrequency";
ALTER TYPE "SubscriptionFrequency_new" RENAME TO "SubscriptionFrequency";

-- AlterTable
DELETE FROM "Subscription";
ALTER TABLE "Subscription" DROP COLUMN "confidence",
                          DROP COLUMN "source",
                          ADD COLUMN "matchDescriptions" TEXT[] NOT NULL DEFAULT '{}',
                          ADD COLUMN "amountTolerance" DOUBLE PRECISION NOT NULL DEFAULT 10.0;

-- AlterTable: Transaction
ALTER TABLE "Transaction" ADD COLUMN "subscriptionId" TEXT;
CREATE INDEX "Transaction_userId_subscriptionId_idx" ON "Transaction"("userId", "subscriptionId");

-- CreateTable: PriceChange
CREATE TABLE "PriceChange" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "previousAmount" DOUBLE PRECISION NOT NULL,
    "newAmount" DOUBLE PRECISION NOT NULL,
    "seen" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PriceChange_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PriceChange_userId_subscriptionId_idx" ON "PriceChange"("userId", "subscriptionId");
CREATE INDEX "PriceChange_userId_seen_idx" ON "PriceChange"("userId", "seen");

-- CreateTable: SubscriptionConflict
CREATE TABLE "SubscriptionConflict" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "subscriptionIds" TEXT[] NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SubscriptionConflict_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SubscriptionConflict_userId_resolved_idx" ON "SubscriptionConflict"("userId", "resolved");

-- DropEnum
DROP TYPE "SubscriptionSource";
