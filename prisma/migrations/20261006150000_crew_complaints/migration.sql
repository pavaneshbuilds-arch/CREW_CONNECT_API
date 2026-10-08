-- Complaints a crew member files against one of their own orders.

CREATE TABLE "crew_complaints" (
    "id" SERIAL NOT NULL,
    "crew_id" INTEGER NOT NULL,
    "booking_id" INTEGER NOT NULL,
    "reason" VARCHAR(50) NOT NULL,
    "details" TEXT NOT NULL,
    "image_urls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "crew_complaints_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "crew_complaints_crew_id_idx" ON "crew_complaints"("crew_id");

CREATE INDEX "crew_complaints_booking_id_idx" ON "crew_complaints"("booking_id");

ALTER TABLE "crew_complaints"
  ADD CONSTRAINT "crew_complaints_crew_id_fkey"
  FOREIGN KEY ("crew_id") REFERENCES "crew_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "crew_complaints"
  ADD CONSTRAINT "crew_complaints_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
