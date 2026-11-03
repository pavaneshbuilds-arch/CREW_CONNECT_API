-- Split the single GST rate into admin-editable CGST and SGST.
-- Existing bookings were charged one GST amount (default 18%). That amount is
-- split evenly so historical totals stay the same: 9% CGST + 9% SGST.

ALTER TABLE "bookings"
  ADD COLUMN "cgst_percent" DECIMAL(5,2),
  ADD COLUMN "sgst_percent" DECIMAL(5,2),
  ADD COLUMN "cgst_amount" DECIMAL(10,2),
  ADD COLUMN "sgst_amount" DECIMAL(10,2);

UPDATE "bookings"
SET
  "cgst_percent" = 9,
  "sgst_percent" = 9,
  "cgst_amount" = ROUND("gst_amount" / 2, 2),
  "sgst_amount" = "gst_amount" - ROUND("gst_amount" / 2, 2)
WHERE "gst_amount" IS NOT NULL;

CREATE TABLE "tax_settings" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "cgst_percent" DECIMAL(5,2) NOT NULL DEFAULT 9,
  "sgst_percent" DECIMAL(5,2) NOT NULL DEFAULT 9,
  "updated_by_admin_id" INTEGER,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tax_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tax_settings_singleton" CHECK ("id" = 1)
);

ALTER TABLE "tax_settings"
  ADD CONSTRAINT "tax_settings_updated_by_admin_id_fkey"
  FOREIGN KEY ("updated_by_admin_id") REFERENCES "admins"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "tax_settings" ("id", "cgst_percent", "sgst_percent")
VALUES (1, 9, 9);
