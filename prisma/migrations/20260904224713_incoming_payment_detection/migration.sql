-- CreateEnum
CREATE TYPE "TransactionDirection" AS ENUM ('DEBIT', 'CREDIT');

-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'INCOMING';

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "direction" "TransactionDirection" NOT NULL DEFAULT 'DEBIT';

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'INCOMING_CREDIT',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "amount" DECIMAL(18,2),
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_customerId_read_createdAt_idx" ON "Notification"("customerId", "read", "createdAt");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
