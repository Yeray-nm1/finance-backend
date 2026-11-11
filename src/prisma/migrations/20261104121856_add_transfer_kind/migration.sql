-- CreateEnum
CREATE TYPE "TransferKind" AS ENUM ('internal', 'external');

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "transferKind" "TransferKind";

-- Backfill: existing transfers were savings movements between own accounts
UPDATE "Transaction"
SET "transferKind" = 'internal'
WHERE "type" = 'transfer';
