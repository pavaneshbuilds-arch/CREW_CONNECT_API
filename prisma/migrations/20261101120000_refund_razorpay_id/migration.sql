-- Razorpay refund id for a cancellation. Null until the gateway accepts the refund.

ALTER TABLE "refunds"
  ADD COLUMN "razorpay_refund_id" VARCHAR(50);

CREATE UNIQUE INDEX "refunds_razorpay_refund_id_key"
  ON "refunds"("razorpay_refund_id");
