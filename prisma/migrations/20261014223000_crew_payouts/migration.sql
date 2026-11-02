-- RazorpayX payouts for completed crew assignments.

CREATE TYPE "CrewPayoutStatus" AS ENUM ('queued', 'processing', 'processed', 'failed', 'reversed');

CREATE TYPE "AssignmentPayoutStatus" AS ENUM ('unpaid', 'processing', 'paid', 'failed', 'reversed');

ALTER TYPE "AuditActionType" ADD VALUE 'crew_payout';

ALTER TABLE "event_crew_assignments"
  ADD COLUMN "payout_status" "AssignmentPayoutStatus" NOT NULL DEFAULT 'unpaid';

ALTER TABLE "crew_bank_details"
  ADD COLUMN "razorpay_contact_id" VARCHAR(50),
  ADD COLUMN "razorpay_fund_account_id" VARCHAR(50);

CREATE TABLE "crew_payouts" (
  "id" SERIAL NOT NULL,
  "booking_id" INTEGER NOT NULL,
  "event_assignment_id" INTEGER NOT NULL,
  "crew_id" INTEGER NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "status" "CrewPayoutStatus" NOT NULL DEFAULT 'queued',
  "razorpay_payout_id" VARCHAR(50),
  "mode" VARCHAR(10) NOT NULL,
  "idempotency_key" VARCHAR(40) NOT NULL,
  "failure_reason" TEXT,
  "paid_by_admin_id" INTEGER NOT NULL,
  "processed_at" TIMESTAMPTZ(6),
  "active_assignment_id" INTEGER,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "crew_payouts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "crew_payouts_razorpay_payout_id_key" ON "crew_payouts"("razorpay_payout_id");

CREATE UNIQUE INDEX "crew_payouts_idempotency_key_key" ON "crew_payouts"("idempotency_key");

CREATE UNIQUE INDEX "crew_payouts_active_assignment_id_key" ON "crew_payouts"("active_assignment_id");

CREATE INDEX "crew_payouts_booking_id_idx" ON "crew_payouts"("booking_id");

CREATE INDEX "crew_payouts_event_assignment_id_idx" ON "crew_payouts"("event_assignment_id");

CREATE INDEX "crew_payouts_crew_id_idx" ON "crew_payouts"("crew_id");

ALTER TABLE "crew_payouts" ADD CONSTRAINT "crew_payouts_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "crew_payouts" ADD CONSTRAINT "crew_payouts_event_assignment_id_fkey" FOREIGN KEY ("event_assignment_id") REFERENCES "event_crew_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "crew_payouts" ADD CONSTRAINT "crew_payouts_crew_id_fkey" FOREIGN KEY ("crew_id") REFERENCES "crew_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "crew_payouts" ADD CONSTRAINT "crew_payouts_paid_by_admin_id_fkey" FOREIGN KEY ("paid_by_admin_id") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
