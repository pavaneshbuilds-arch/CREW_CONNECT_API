ALTER TABLE "crew_rate_cards"
  ADD COLUMN "crew_share_percent" DECIMAL(5,2) NOT NULL DEFAULT 100;

ALTER TABLE "booking_crew_requirements"
  ADD COLUMN "crew_share_percent" DECIMAL(5,2) NOT NULL DEFAULT 100,
  ADD COLUMN "crew_amount" DECIMAL(10,2);

UPDATE "booking_crew_requirements"
SET "crew_amount" = "rate_per_hour"
WHERE "crew_amount" IS NULL;

ALTER TABLE "booking_crew_requirements"
  ALTER COLUMN "crew_amount" SET NOT NULL;

ALTER TABLE "crew_rate_logs"
  ADD COLUMN "previous_crew_share_percent" DECIMAL(5,2) NOT NULL DEFAULT 100,
  ADD COLUMN "new_crew_share_percent" DECIMAL(5,2) NOT NULL DEFAULT 100;
