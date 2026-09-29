-- Per-person shift codes and precomputed waiter quotas per supervisor slot.

ALTER TABLE "event_crew_assignments"
  ADD COLUMN "shift_otp" VARCHAR(4),
  ADD COLUMN "shift_otp_issued_at" TIMESTAMPTZ(6),
  ADD COLUMN "reports_to_assignment_id" INTEGER;

CREATE INDEX "event_crew_assignments_reports_to_assignment_id_idx"
  ON "event_crew_assignments"("reports_to_assignment_id");

ALTER TABLE "event_crew_assignments"
  ADD CONSTRAINT "event_crew_assignments_reports_to_assignment_id_fkey"
  FOREIGN KEY ("reports_to_assignment_id") REFERENCES "event_crew_assignments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "booking_supervisor_slots" (
    "id" SERIAL NOT NULL,
    "booking_id" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "waiter_quota" INTEGER NOT NULL,
    "supervisor_assignment_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "booking_supervisor_slots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "booking_supervisor_slots_supervisor_assignment_id_key"
  ON "booking_supervisor_slots"("supervisor_assignment_id");

CREATE INDEX "booking_supervisor_slots_booking_id_sort_order_idx"
  ON "booking_supervisor_slots"("booking_id", "sort_order");

ALTER TABLE "booking_supervisor_slots"
  ADD CONSTRAINT "booking_supervisor_slots_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_supervisor_slots"
  ADD CONSTRAINT "booking_supervisor_slots_supervisor_assignment_id_fkey"
  FOREIGN KEY ("supervisor_assignment_id") REFERENCES "event_crew_assignments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
