-- CreateEnum
CREATE TYPE "CancellationReason" AS ENUM ('SHIPPER_FREIGHT_NOT_READY', 'SHIPPER_CANCELLED', 'SHIPPER_APPOINTMENT_CHANGE', 'CARRIER_NO_SHOW', 'CARRIER_LATE', 'CARRIER_EQUIPMENT_FAILURE', 'CARRIER_FELL_OFF', 'BROKER_RATE_ISSUE', 'BROKER_COMPLIANCE_HOLD', 'DUPLICATE_ENTRY', 'OTHER');

-- CreateEnum
CREATE TYPE "FaultParty" AS ENUM ('SHIPPER', 'CARRIER', 'BROKER', 'NONE');

-- DropForeignKey
ALTER TABLE "info_requests" DROP CONSTRAINT "info_requests_cancelledById_fkey";

-- DropForeignKey
ALTER TABLE "info_requests" DROP CONSTRAINT "info_requests_createdById_fkey";

-- AlterTable
ALTER TABLE "loads" ADD COLUMN     "cancellationFaultParty" "FaultParty",
ADD COLUMN     "cancellationReasonCode" "CancellationReason",
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledById" TEXT;

-- AlterTable
ALTER TABLE "training_questions" ALTER COLUMN "options" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "loads_cancellationFaultParty_idx" ON "loads"("cancellationFaultParty");

-- AddForeignKey
ALTER TABLE "info_requests" ADD CONSTRAINT "info_requests_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "info_requests" ADD CONSTRAINT "info_requests_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
