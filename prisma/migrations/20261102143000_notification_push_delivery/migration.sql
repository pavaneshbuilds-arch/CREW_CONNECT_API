-- Push delivery columns for the background worker, plus reminder cancellation.
-- New enum values are not inserted in this migration.

CREATE TYPE "NotificationPushStatus" AS ENUM ('pending', 'processing', 'sent', 'failed', 'skipped');

ALTER TYPE "NotificationType" ADD VALUE 'job_accepted';
ALTER TYPE "NotificationType" ADD VALUE 'crew_assigned';
ALTER TYPE "NotificationType" ADD VALUE 'booking_cancelled';
ALTER TYPE "NotificationType" ADD VALUE 'profile_approved';
ALTER TYPE "NotificationType" ADD VALUE 'profile_rejected';
ALTER TYPE "NotificationType" ADD VALUE 'payout_processed';
ALTER TYPE "NotificationType" ADD VALUE 'payout_failed';
ALTER TYPE "NotificationType" ADD VALUE 'payout_reversed';

ALTER TYPE "ReminderStatus" ADD VALUE 'cancelled';

ALTER TABLE "notifications"
  ADD COLUMN "data" JSONB,
  ADD COLUMN "push_status" "NotificationPushStatus" NOT NULL DEFAULT 'pending',
  ADD COLUMN "push_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "push_locked_at" TIMESTAMPTZ(6),
  ADD COLUMN "push_next_attempt_at" TIMESTAMPTZ(6),
  ADD COLUMN "push_sent_at" TIMESTAMPTZ(6),
  ADD COLUMN "push_error" VARCHAR(500);

CREATE INDEX "notifications_push_status_created_at_idx" ON "notifications"("push_status", "created_at");

CREATE UNIQUE INDEX "scheduled_reminders_recipient_type_key"
  ON "scheduled_reminders"("booking_id", "recipient_type", "recipient_id", "reminder_type");
