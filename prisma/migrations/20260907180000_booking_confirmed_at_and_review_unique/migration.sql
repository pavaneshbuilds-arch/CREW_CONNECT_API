-- Timeline accuracy for placed bookings.
ALTER TABLE "bookings" ADD COLUMN "confirmed_at" TIMESTAMPTZ(6);

-- One review per booking. Unique index also covers lookups.
DROP INDEX IF EXISTS "reviews_booking_id_idx";
CREATE UNIQUE INDEX "reviews_booking_id_key" ON "reviews"("booking_id");

-- Refunds can be recorded before a gateway payment exists (place-order stub).
ALTER TABLE "refunds" ALTER COLUMN "payment_id" DROP NOT NULL;
