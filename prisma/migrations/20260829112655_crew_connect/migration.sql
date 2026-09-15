-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('phone_otp', 'google');

-- CreateEnum
CREATE TYPE "AddressType" AS ENUM ('home', 'work', 'other');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female', 'other');

-- CreateEnum
CREATE TYPE "CrewRole" AS ENUM ('waiter', 'supervisor', 'bouncer');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "EditRequestStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('super_admin', 'ops_admin');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('pending_payment', 'confirmed', 'crew_assigned', 'in_progress', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "AssignmentMethod" AS ENUM ('self_assigned', 'admin_assigned');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('assigned', 'confirmed', 'cancelled_by_crew', 'no_show', 'in_progress', 'completed', 'removed_by_admin');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('advance', 'balance', 'refund');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'success', 'failed', 'refunded');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('pending', 'processed', 'failed');

-- CreateEnum
CREATE TYPE "WalletTxnType" AS ENUM ('credit_earning', 'credit_bonus', 'debit_penalty', 'debit_redemption');

-- CreateEnum
CREATE TYPE "PenaltyReason" AS ENUM ('no_show', 'late_cancellation');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('flat', 'percentage');

-- CreateEnum
CREATE TYPE "AuditActionType" AS ENUM ('crew_verified', 'crew_rejected', 'crew_assigned_manually', 'crew_reassigned', 'crew_removed', 'profile_edit_approved', 'profile_edit_rejected', 'other');

-- CreateEnum
CREATE TYPE "ReminderRecipientType" AS ENUM ('user', 'crew');

-- CreateEnum
CREATE TYPE "ReminderType" AS ENUM ('1_day_before', '2_hours_before');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('pending', 'sent', 'failed');

-- CreateEnum
CREATE TYPE "AuthSubjectType" AS ENUM ('user', 'crew', 'admin');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "phone_number" VARCHAR(15) NOT NULL,
    "email" VARCHAR(255),
    "full_name" VARCHAR(150),
    "profile_photo_url" TEXT,
    "auth_provider" "AuthProvider" NOT NULL,
    "google_id" VARCHAR(255),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "location_access_enabled" BOOLEAN NOT NULL DEFAULT false,
    "push_notifications_enabled" BOOLEAN NOT NULL DEFAULT true,
    "marketing_opt_in" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_addresses" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "house_flat_number" VARCHAR(50),
    "pincode" VARCHAR(10),
    "apartment_building" VARCHAR(150),
    "contact_number" VARCHAR(15),
    "floor_number" VARCHAR(20),
    "landmark" VARCHAR(150),
    "address_type" "AddressType" NOT NULL,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crew_members" (
    "id" UUID NOT NULL,
    "phone_number" VARCHAR(15) NOT NULL,
    "email" VARCHAR(255),
    "full_name" VARCHAR(150),
    "profile_photo_url" TEXT,
    "date_of_birth" DATE,
    "gender" "Gender",
    "city" VARCHAR(100),
    "current_address" TEXT,
    "primary_role" "CrewRole" NOT NULL,
    "years_of_experience" SMALLINT,
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'pending',
    "rejection_reason" TEXT,
    "rating_avg" DECIMAL(2,1) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_online" BOOLEAN NOT NULL DEFAULT false,
    "current_latitude" DECIMAL(9,6),
    "current_longitude" DECIMAL(9,6),
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "crew_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crew_languages" (
    "id" UUID NOT NULL,
    "crew_id" UUID NOT NULL,
    "language" VARCHAR(50) NOT NULL,

    CONSTRAINT "crew_languages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crew_skills" (
    "id" UUID NOT NULL,
    "crew_id" UUID NOT NULL,
    "skill" VARCHAR(100) NOT NULL,

    CONSTRAINT "crew_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crew_identity_documents" (
    "id" UUID NOT NULL,
    "crew_id" UUID NOT NULL,
    "aadhaar_number" VARCHAR(20),
    "aadhaar_front_url" TEXT,
    "aadhaar_back_url" TEXT,
    "pan_number" VARCHAR(15),
    "pan_card_url" TEXT,
    "verified_by_admin_id" UUID,
    "verified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "crew_identity_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crew_bank_details" (
    "id" UUID NOT NULL,
    "crew_id" UUID NOT NULL,
    "account_holder_name" VARCHAR(150),
    "account_number" VARCHAR(30),
    "ifsc_code" VARCHAR(15),
    "upi_id" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "crew_bank_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crew_profile_edit_requests" (
    "id" UUID NOT NULL,
    "crew_id" UUID NOT NULL,
    "changed_fields" JSONB NOT NULL,
    "status" "EditRequestStatus" NOT NULL DEFAULT 'pending',
    "reviewed_by_admin_id" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "crew_profile_edit_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admins" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" VARCHAR(150),
    "role" "AdminRole" NOT NULL DEFAULT 'ops_admin',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crew_weekly_availability" (
    "id" UUID NOT NULL,
    "crew_id" UUID NOT NULL,
    "day_of_week" SMALLINT NOT NULL,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "shift_start" TIME(6),
    "shift_end" TIME(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "crew_weekly_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crew_time_off" (
    "id" UUID NOT NULL,
    "crew_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "reason" VARCHAR(150),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "crew_time_off_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crew_date_blocks" (
    "id" UUID NOT NULL,
    "crew_id" UUID NOT NULL,
    "blocked_date" DATE NOT NULL,
    "event_assignment_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "crew_date_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "booking_reference" VARCHAR(20) NOT NULL,
    "user_id" UUID NOT NULL,
    "event_type" VARCHAR(100),
    "guest_count" INTEGER,
    "food_service_type" VARCHAR(50),
    "food_items_count" INTEGER,
    "event_date" DATE,
    "event_start_time" TIME(6),
    "expected_duration_hours" DECIMAL(4,1),
    "venue_name" VARCHAR(200),
    "venue_address" TEXT,
    "venue_latitude" DECIMAL(9,6),
    "venue_longitude" DECIMAL(9,6),
    "additional_instructions" TEXT,
    "status" "BookingStatus" NOT NULL DEFAULT 'pending_payment',
    "subtotal" DECIMAL(10,2),
    "gst_amount" DECIMAL(10,2),
    "discount_amount" DECIMAL(10,2),
    "estimated_total" DECIMAL(10,2),
    "coupon_id" UUID,
    "advance_paid_pct" DECIMAL(4,1) NOT NULL DEFAULT 50.0,
    "shift_otp" VARCHAR(4),
    "cancelled_at" TIMESTAMPTZ(6),
    "cancellation_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_crew_requirements" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "role" "CrewRole" NOT NULL,
    "count_required" INTEGER NOT NULL,
    "rate_per_hour" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "booking_crew_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_crew_assignments" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "crew_id" UUID NOT NULL,
    "role" "CrewRole" NOT NULL,
    "assignment_method" "AssignmentMethod" NOT NULL,
    "assigned_by_admin_id" UUID,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'assigned',
    "unavailability_notified_at" TIMESTAMPTZ(6),
    "shift_started_at" TIMESTAMPTZ(6),
    "shift_completed_at" TIMESTAMPTZ(6),
    "earnings_amount" DECIMAL(10,2),
    "performance_bonus" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "reopened_for_reassignment" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "event_crew_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "payment_type" "PaymentType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "payment_gateway_ref" VARCHAR(150),
    "paid_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "cancellation_days_before_event" DECIMAL(4,1),
    "refund_pct_applied" DECIMAL(5,2),
    "refund_amount" DECIMAL(10,2),
    "status" "RefundStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crew_wallets" (
    "id" UUID NOT NULL,
    "crew_id" UUID NOT NULL,
    "balance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "pending_payout" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "crew_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" UUID NOT NULL,
    "wallet_id" UUID NOT NULL,
    "event_assignment_id" UUID,
    "type" "WalletTxnType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "balance_after" DECIMAL(10,2) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crew_penalties" (
    "id" UUID NOT NULL,
    "crew_id" UUID NOT NULL,
    "event_assignment_id" UUID NOT NULL,
    "reason" "PenaltyReason" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "applied_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "crew_penalties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "rating" SMALLINT NOT NULL,
    "would_recommend" BOOLEAN,
    "review_text" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupons" (
    "id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "description" TEXT,
    "discount_type" "DiscountType" NOT NULL,
    "discount_value" DECIMAL(10,2) NOT NULL,
    "min_spend" DECIMAL(10,2),
    "valid_from" TIMESTAMPTZ(6),
    "valid_until" TIMESTAMPTZ(6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_logs" (
    "id" UUID NOT NULL,
    "admin_id" UUID NOT NULL,
    "action_type" "AuditActionType" NOT NULL,
    "target_entity_type" VARCHAR(50),
    "target_entity_id" UUID,
    "details" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_reminders" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "recipient_type" "ReminderRecipientType" NOT NULL,
    "recipient_id" UUID NOT NULL,
    "reminder_type" "ReminderType" NOT NULL,
    "scheduled_at" TIMESTAMPTZ(6) NOT NULL,
    "sent_at" TIMESTAMPTZ(6),
    "status" "ReminderStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "scheduled_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_verifications" (
    "id" UUID NOT NULL,
    "phone_number" VARCHAR(15) NOT NULL,
    "subject_type" "AuthSubjectType" NOT NULL,
    "code_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "subject_type" "AuthSubjectType" NOT NULL,
    "subject_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_number_key" ON "users"("phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "user_addresses_user_id_idx" ON "user_addresses"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "crew_members_phone_number_key" ON "crew_members"("phone_number");

-- CreateIndex
CREATE INDEX "crew_languages_crew_id_idx" ON "crew_languages"("crew_id");

-- CreateIndex
CREATE INDEX "crew_skills_crew_id_idx" ON "crew_skills"("crew_id");

-- CreateIndex
CREATE INDEX "crew_identity_documents_crew_id_idx" ON "crew_identity_documents"("crew_id");

-- CreateIndex
CREATE INDEX "crew_bank_details_crew_id_idx" ON "crew_bank_details"("crew_id");

-- CreateIndex
CREATE INDEX "crew_profile_edit_requests_crew_id_idx" ON "crew_profile_edit_requests"("crew_id");

-- CreateIndex
CREATE UNIQUE INDEX "admins_email_key" ON "admins"("email");

-- CreateIndex
CREATE INDEX "crew_weekly_availability_crew_id_idx" ON "crew_weekly_availability"("crew_id");

-- CreateIndex
CREATE INDEX "crew_time_off_crew_id_idx" ON "crew_time_off"("crew_id");

-- CreateIndex
CREATE UNIQUE INDEX "crew_date_blocks_crew_id_blocked_date_key" ON "crew_date_blocks"("crew_id", "blocked_date");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_booking_reference_key" ON "bookings"("booking_reference");

-- CreateIndex
CREATE INDEX "bookings_user_id_idx" ON "bookings"("user_id");

-- CreateIndex
CREATE INDEX "bookings_status_idx" ON "bookings"("status");

-- CreateIndex
CREATE INDEX "bookings_event_date_idx" ON "bookings"("event_date");

-- CreateIndex
CREATE INDEX "booking_crew_requirements_booking_id_idx" ON "booking_crew_requirements"("booking_id");

-- CreateIndex
CREATE INDEX "event_crew_assignments_booking_id_idx" ON "event_crew_assignments"("booking_id");

-- CreateIndex
CREATE INDEX "event_crew_assignments_crew_id_idx" ON "event_crew_assignments"("crew_id");

-- CreateIndex
CREATE INDEX "event_crew_assignments_status_idx" ON "event_crew_assignments"("status");

-- CreateIndex
CREATE INDEX "payments_booking_id_idx" ON "payments"("booking_id");

-- CreateIndex
CREATE INDEX "refunds_booking_id_idx" ON "refunds"("booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "crew_wallets_crew_id_key" ON "crew_wallets"("crew_id");

-- CreateIndex
CREATE INDEX "wallet_transactions_wallet_id_idx" ON "wallet_transactions"("wallet_id");

-- CreateIndex
CREATE INDEX "crew_penalties_crew_id_idx" ON "crew_penalties"("crew_id");

-- CreateIndex
CREATE INDEX "reviews_booking_id_idx" ON "reviews"("booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");

-- CreateIndex
CREATE INDEX "admin_audit_logs_admin_id_idx" ON "admin_audit_logs"("admin_id");

-- CreateIndex
CREATE INDEX "admin_audit_logs_created_at_idx" ON "admin_audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "scheduled_reminders_booking_id_idx" ON "scheduled_reminders"("booking_id");

-- CreateIndex
CREATE INDEX "scheduled_reminders_status_scheduled_at_idx" ON "scheduled_reminders"("status", "scheduled_at");

-- CreateIndex
CREATE INDEX "otp_verifications_phone_number_subject_type_idx" ON "otp_verifications"("phone_number", "subject_type");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_subject_type_subject_id_idx" ON "refresh_tokens"("subject_type", "subject_id");

-- AddForeignKey
ALTER TABLE "user_addresses" ADD CONSTRAINT "user_addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crew_languages" ADD CONSTRAINT "crew_languages_crew_id_fkey" FOREIGN KEY ("crew_id") REFERENCES "crew_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crew_skills" ADD CONSTRAINT "crew_skills_crew_id_fkey" FOREIGN KEY ("crew_id") REFERENCES "crew_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crew_identity_documents" ADD CONSTRAINT "crew_identity_documents_crew_id_fkey" FOREIGN KEY ("crew_id") REFERENCES "crew_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crew_identity_documents" ADD CONSTRAINT "crew_identity_documents_verified_by_admin_id_fkey" FOREIGN KEY ("verified_by_admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crew_bank_details" ADD CONSTRAINT "crew_bank_details_crew_id_fkey" FOREIGN KEY ("crew_id") REFERENCES "crew_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crew_profile_edit_requests" ADD CONSTRAINT "crew_profile_edit_requests_crew_id_fkey" FOREIGN KEY ("crew_id") REFERENCES "crew_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crew_profile_edit_requests" ADD CONSTRAINT "crew_profile_edit_requests_reviewed_by_admin_id_fkey" FOREIGN KEY ("reviewed_by_admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crew_weekly_availability" ADD CONSTRAINT "crew_weekly_availability_crew_id_fkey" FOREIGN KEY ("crew_id") REFERENCES "crew_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crew_time_off" ADD CONSTRAINT "crew_time_off_crew_id_fkey" FOREIGN KEY ("crew_id") REFERENCES "crew_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crew_date_blocks" ADD CONSTRAINT "crew_date_blocks_crew_id_fkey" FOREIGN KEY ("crew_id") REFERENCES "crew_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crew_date_blocks" ADD CONSTRAINT "crew_date_blocks_event_assignment_id_fkey" FOREIGN KEY ("event_assignment_id") REFERENCES "event_crew_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_crew_requirements" ADD CONSTRAINT "booking_crew_requirements_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_crew_assignments" ADD CONSTRAINT "event_crew_assignments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_crew_assignments" ADD CONSTRAINT "event_crew_assignments_crew_id_fkey" FOREIGN KEY ("crew_id") REFERENCES "crew_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_crew_assignments" ADD CONSTRAINT "event_crew_assignments_assigned_by_admin_id_fkey" FOREIGN KEY ("assigned_by_admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crew_wallets" ADD CONSTRAINT "crew_wallets_crew_id_fkey" FOREIGN KEY ("crew_id") REFERENCES "crew_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "crew_wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_event_assignment_id_fkey" FOREIGN KEY ("event_assignment_id") REFERENCES "event_crew_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crew_penalties" ADD CONSTRAINT "crew_penalties_crew_id_fkey" FOREIGN KEY ("crew_id") REFERENCES "crew_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crew_penalties" ADD CONSTRAINT "crew_penalties_event_assignment_id_fkey" FOREIGN KEY ("event_assignment_id") REFERENCES "event_crew_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_reminders" ADD CONSTRAINT "scheduled_reminders_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
