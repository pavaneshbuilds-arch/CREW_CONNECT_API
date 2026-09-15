-- Encrypted at-rest values (AES-256-GCM: base64(iv).base64(tag).base64(ciphertext))
-- are ~60–80 chars. The original columns were sized for plaintext identifiers.
ALTER TABLE "crew_identity_documents"
  ALTER COLUMN "aadhaar_number" TYPE TEXT,
  ALTER COLUMN "pan_number" TYPE TEXT;

ALTER TABLE "crew_bank_details"
  ALTER COLUMN "account_number" TYPE TEXT;
