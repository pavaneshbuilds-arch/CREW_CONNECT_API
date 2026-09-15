-- AlterEnum
ALTER TYPE "AuditActionType" ADD VALUE 'rate_updated';

-- CreateTable
CREATE TABLE "crew_rate_cards" (
    "id" SERIAL NOT NULL,
    "role" "CrewRole" NOT NULL,
    "rate_per_hour" DECIMAL(10,2) NOT NULL,
    "updated_by_admin_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "crew_rate_cards_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "crew_rate_cards_role_key" ON "crew_rate_cards"("role");

CREATE TABLE "crew_rate_logs" (
    "id" SERIAL NOT NULL,
    "rate_card_id" INTEGER NOT NULL,
    "role" "CrewRole" NOT NULL,
    "previous_rate" DECIMAL(10,2) NOT NULL,
    "new_rate" DECIMAL(10,2) NOT NULL,
    "changed_by_admin_id" INTEGER NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crew_rate_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "crew_rate_logs_rate_card_id_idx" ON "crew_rate_logs"("rate_card_id");
CREATE INDEX "crew_rate_logs_role_idx" ON "crew_rate_logs"("role");
CREATE INDEX "crew_rate_logs_created_at_idx" ON "crew_rate_logs"("created_at");

ALTER TABLE "crew_rate_cards"
  ADD CONSTRAINT "crew_rate_cards_updated_by_admin_id_fkey"
  FOREIGN KEY ("updated_by_admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "crew_rate_logs"
  ADD CONSTRAINT "crew_rate_logs_rate_card_id_fkey"
  FOREIGN KEY ("rate_card_id") REFERENCES "crew_rate_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "crew_rate_logs"
  ADD CONSTRAINT "crew_rate_logs_changed_by_admin_id_fkey"
  FOREIGN KEY ("changed_by_admin_id") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "crew_rate_cards" ("role", "rate_per_hour", "updated_at")
VALUES
  ('waiter'::"CrewRole", 800, CURRENT_TIMESTAMP),
  ('supervisor'::"CrewRole", 1000, CURRENT_TIMESTAMP),
  ('bouncer'::"CrewRole", 900, CURRENT_TIMESTAMP)
ON CONFLICT ("role") DO NOTHING;
