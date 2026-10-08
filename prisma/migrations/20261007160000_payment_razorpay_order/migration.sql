-- Razorpay order id for the organizer checkout. The payment id is stored in payment_gateway_ref after capture.

ALTER TABLE "payments"
  ADD COLUMN "razorpay_order_id" VARCHAR(50);

CREATE UNIQUE INDEX "payments_razorpay_order_id_key"
  ON "payments"("razorpay_order_id");
