-- Track explicit "submit for verification" so incomplete signups stay out of the admin queue.
ALTER TABLE "crew_members" ADD COLUMN "submitted_at" TIMESTAMPTZ(6);

-- Existing complete profiles (already filled the required onboarding fields) count as submitted.
UPDATE "crew_members" AS c
SET "submitted_at" = COALESCE(c.updated_at, NOW())
WHERE c.deleted_at IS NULL
  AND c.full_name IS NOT NULL
  AND c.date_of_birth IS NOT NULL
  AND c.gender IS NOT NULL
  AND c.city IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "crew_identity_documents" d
    WHERE d.crew_id = c.id AND d.aadhaar_number IS NOT NULL
  )
  AND EXISTS (
    SELECT 1 FROM "crew_bank_details" b
    WHERE b.crew_id = c.id AND b.account_number IS NOT NULL
  );
