-- Unique crew-per-booking assignment + persist rejected job offers so they
-- do not reappear in the crew home feed.

CREATE UNIQUE INDEX "event_crew_assignments_booking_id_crew_id_key"
  ON "event_crew_assignments"("booking_id", "crew_id");

CREATE TABLE "crew_job_rejections" (
    "id" SERIAL NOT NULL,
    "booking_id" INTEGER NOT NULL,
    "crew_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crew_job_rejections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "crew_job_rejections_booking_id_crew_id_key"
  ON "crew_job_rejections"("booking_id", "crew_id");

CREATE INDEX "crew_job_rejections_crew_id_idx" ON "crew_job_rejections"("crew_id");

ALTER TABLE "crew_job_rejections"
  ADD CONSTRAINT "crew_job_rejections_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "crew_job_rejections"
  ADD CONSTRAINT "crew_job_rejections_crew_id_fkey"
  FOREIGN KEY ("crew_id") REFERENCES "crew_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
