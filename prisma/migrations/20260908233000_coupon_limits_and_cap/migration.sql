-- AlterEnum
ALTER TYPE "AuditActionType" ADD VALUE 'coupon_created';
ALTER TYPE "AuditActionType" ADD VALUE 'coupon_updated';
ALTER TYPE "AuditActionType" ADD VALUE 'coupon_deleted';

-- AlterTable
ALTER TABLE "coupons"
  ADD COLUMN "max_discount_amount" DECIMAL(10, 2),
  ADD COLUMN "max_uses" INTEGER,
  ADD COLUMN "max_uses_per_user" INTEGER;

CREATE INDEX "bookings_coupon_id_idx" ON "bookings"("coupon_id");
