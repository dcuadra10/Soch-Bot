-- AlterTable
ALTER TABLE "Kingdom" ADD COLUMN     "migrationClose" TIMESTAMP(3),
ADD COLUMN     "migrationOpen" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "notified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'PENDING';
