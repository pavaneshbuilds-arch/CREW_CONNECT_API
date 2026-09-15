-- Ranges are keyed by waiter count, not total cover staff.

ALTER TABLE "supervisor_staffing_ranges" RENAME COLUMN "min_staff" TO "min_waiters";
ALTER TABLE "supervisor_staffing_ranges" RENAME COLUMN "max_staff" TO "max_waiters";

DROP INDEX IF EXISTS "supervisor_staffing_ranges_min_staff_idx";
CREATE INDEX "supervisor_staffing_ranges_min_waiters_idx"
  ON "supervisor_staffing_ranges"("min_waiters");
