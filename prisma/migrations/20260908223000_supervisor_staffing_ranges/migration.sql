-- Supervisor count for crew suggestion is configured as staff ranges
-- (cover staff = ceil(guestCount / cover ratio)).

ALTER TYPE "AuditActionType" ADD VALUE 'supervisor_ranges_updated';

CREATE TABLE "supervisor_staffing_ranges" (
    "id" SERIAL NOT NULL,
    "min_staff" INTEGER NOT NULL,
    "max_staff" INTEGER,
    "supervisor_count" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "supervisor_staffing_ranges_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "supervisor_staffing_ranges_min_staff_idx"
  ON "supervisor_staffing_ranges"("min_staff");

INSERT INTO "supervisor_staffing_ranges" ("min_staff", "max_staff", "supervisor_count", "updated_at")
VALUES
  (5, 10, 1, CURRENT_TIMESTAMP),
  (11, 19, 2, CURRENT_TIMESTAMP),
  (20, 29, 3, CURRENT_TIMESTAMP),
  (30, 39, 4, CURRENT_TIMESTAMP),
  (40, NULL, 5, CURRENT_TIMESTAMP);
