/*
  Warnings:

  - The primary key for the `admin_audit_logs` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `admin_audit_logs` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `target_entity_id` column on the `admin_audit_logs` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `admins` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `admins` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `booking_crew_requirements` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `booking_crew_requirements` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `bookings` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `bookings` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `coupon_id` column on the `bookings` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `coupons` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `coupons` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `crew_bank_details` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `crew_bank_details` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `crew_date_blocks` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `crew_date_blocks` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `event_assignment_id` column on the `crew_date_blocks` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `crew_identity_documents` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `crew_identity_documents` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `verified_by_admin_id` column on the `crew_identity_documents` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `crew_languages` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `crew_languages` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `crew_members` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `crew_members` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `crew_penalties` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `crew_penalties` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `crew_profile_edit_requests` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `crew_profile_edit_requests` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `reviewed_by_admin_id` column on the `crew_profile_edit_requests` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `crew_skills` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `crew_skills` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `crew_time_off` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `crew_time_off` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `crew_wallets` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `crew_wallets` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `crew_weekly_availability` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `crew_weekly_availability` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `event_crew_assignments` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `event_crew_assignments` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `assigned_by_admin_id` column on the `event_crew_assignments` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `otp_verifications` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `otp_verifications` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `payments` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `payments` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `refresh_tokens` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `refresh_tokens` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `refunds` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `refunds` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `reviews` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `reviews` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `scheduled_reminders` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `scheduled_reminders` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `user_addresses` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `user_addresses` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `users` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `users` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `wallet_transactions` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `wallet_transactions` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `event_assignment_id` column on the `wallet_transactions` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Changed the type of `admin_id` on the `admin_audit_logs` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `booking_id` on the `booking_crew_requirements` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `user_id` on the `bookings` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `crew_id` on the `crew_bank_details` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `crew_id` on the `crew_date_blocks` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `crew_id` on the `crew_identity_documents` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `crew_id` on the `crew_languages` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `crew_id` on the `crew_penalties` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `event_assignment_id` on the `crew_penalties` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `crew_id` on the `crew_profile_edit_requests` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `crew_id` on the `crew_skills` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `crew_id` on the `crew_time_off` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `crew_id` on the `crew_wallets` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `crew_id` on the `crew_weekly_availability` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `booking_id` on the `event_crew_assignments` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `crew_id` on the `event_crew_assignments` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `booking_id` on the `payments` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `subject_id` on the `refresh_tokens` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `booking_id` on the `refunds` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `payment_id` on the `refunds` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `booking_id` on the `reviews` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `user_id` on the `reviews` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `booking_id` on the `scheduled_reminders` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `recipient_id` on the `scheduled_reminders` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `user_id` on the `user_addresses` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `wallet_id` on the `wallet_transactions` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropForeignKey
ALTER TABLE "admin_audit_logs" DROP CONSTRAINT "admin_audit_logs_admin_id_fkey";

-- DropForeignKey
ALTER TABLE "booking_crew_requirements" DROP CONSTRAINT "booking_crew_requirements_booking_id_fkey";

-- DropForeignKey
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_coupon_id_fkey";

-- DropForeignKey
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_user_id_fkey";

-- DropForeignKey
ALTER TABLE "crew_bank_details" DROP CONSTRAINT "crew_bank_details_crew_id_fkey";

-- DropForeignKey
ALTER TABLE "crew_date_blocks" DROP CONSTRAINT "crew_date_blocks_crew_id_fkey";

-- DropForeignKey
ALTER TABLE "crew_date_blocks" DROP CONSTRAINT "crew_date_blocks_event_assignment_id_fkey";

-- DropForeignKey
ALTER TABLE "crew_identity_documents" DROP CONSTRAINT "crew_identity_documents_crew_id_fkey";

-- DropForeignKey
ALTER TABLE "crew_identity_documents" DROP CONSTRAINT "crew_identity_documents_verified_by_admin_id_fkey";

-- DropForeignKey
ALTER TABLE "crew_languages" DROP CONSTRAINT "crew_languages_crew_id_fkey";

-- DropForeignKey
ALTER TABLE "crew_penalties" DROP CONSTRAINT "crew_penalties_crew_id_fkey";

-- DropForeignKey
ALTER TABLE "crew_penalties" DROP CONSTRAINT "crew_penalties_event_assignment_id_fkey";

-- DropForeignKey
ALTER TABLE "crew_profile_edit_requests" DROP CONSTRAINT "crew_profile_edit_requests_crew_id_fkey";

-- DropForeignKey
ALTER TABLE "crew_profile_edit_requests" DROP CONSTRAINT "crew_profile_edit_requests_reviewed_by_admin_id_fkey";

-- DropForeignKey
ALTER TABLE "crew_skills" DROP CONSTRAINT "crew_skills_crew_id_fkey";

-- DropForeignKey
ALTER TABLE "crew_time_off" DROP CONSTRAINT "crew_time_off_crew_id_fkey";

-- DropForeignKey
ALTER TABLE "crew_wallets" DROP CONSTRAINT "crew_wallets_crew_id_fkey";

-- DropForeignKey
ALTER TABLE "crew_weekly_availability" DROP CONSTRAINT "crew_weekly_availability_crew_id_fkey";

-- DropForeignKey
ALTER TABLE "event_crew_assignments" DROP CONSTRAINT "event_crew_assignments_assigned_by_admin_id_fkey";

-- DropForeignKey
ALTER TABLE "event_crew_assignments" DROP CONSTRAINT "event_crew_assignments_booking_id_fkey";

-- DropForeignKey
ALTER TABLE "event_crew_assignments" DROP CONSTRAINT "event_crew_assignments_crew_id_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_booking_id_fkey";

-- DropForeignKey
ALTER TABLE "refunds" DROP CONSTRAINT "refunds_booking_id_fkey";

-- DropForeignKey
ALTER TABLE "refunds" DROP CONSTRAINT "refunds_payment_id_fkey";

-- DropForeignKey
ALTER TABLE "reviews" DROP CONSTRAINT "reviews_booking_id_fkey";

-- DropForeignKey
ALTER TABLE "reviews" DROP CONSTRAINT "reviews_user_id_fkey";

-- DropForeignKey
ALTER TABLE "scheduled_reminders" DROP CONSTRAINT "scheduled_reminders_booking_id_fkey";

-- DropForeignKey
ALTER TABLE "user_addresses" DROP CONSTRAINT "user_addresses_user_id_fkey";

-- DropForeignKey
ALTER TABLE "wallet_transactions" DROP CONSTRAINT "wallet_transactions_event_assignment_id_fkey";

-- DropForeignKey
ALTER TABLE "wallet_transactions" DROP CONSTRAINT "wallet_transactions_wallet_id_fkey";

-- AlterTable
ALTER TABLE "admin_audit_logs" DROP CONSTRAINT "admin_audit_logs_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "admin_id",
ADD COLUMN     "admin_id" INTEGER NOT NULL,
DROP COLUMN "target_entity_id",
ADD COLUMN     "target_entity_id" INTEGER,
ADD CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "admins" DROP CONSTRAINT "admins_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "admins_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "booking_crew_requirements" DROP CONSTRAINT "booking_crew_requirements_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "booking_id",
ADD COLUMN     "booking_id" INTEGER NOT NULL,
ADD CONSTRAINT "booking_crew_requirements_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "user_id",
ADD COLUMN     "user_id" INTEGER NOT NULL,
DROP COLUMN "coupon_id",
ADD COLUMN     "coupon_id" INTEGER,
ADD CONSTRAINT "bookings_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "coupons" DROP CONSTRAINT "coupons_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "coupons_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "crew_bank_details" DROP CONSTRAINT "crew_bank_details_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "crew_id",
ADD COLUMN     "crew_id" INTEGER NOT NULL,
ADD CONSTRAINT "crew_bank_details_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "crew_date_blocks" DROP CONSTRAINT "crew_date_blocks_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "crew_id",
ADD COLUMN     "crew_id" INTEGER NOT NULL,
DROP COLUMN "event_assignment_id",
ADD COLUMN     "event_assignment_id" INTEGER,
ADD CONSTRAINT "crew_date_blocks_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "crew_identity_documents" DROP CONSTRAINT "crew_identity_documents_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "crew_id",
ADD COLUMN     "crew_id" INTEGER NOT NULL,
DROP COLUMN "verified_by_admin_id",
ADD COLUMN     "verified_by_admin_id" INTEGER,
ADD CONSTRAINT "crew_identity_documents_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "crew_languages" DROP CONSTRAINT "crew_languages_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "crew_id",
ADD COLUMN     "crew_id" INTEGER NOT NULL,
ADD CONSTRAINT "crew_languages_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "crew_members" DROP CONSTRAINT "crew_members_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "crew_members_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "crew_penalties" DROP CONSTRAINT "crew_penalties_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "crew_id",
ADD COLUMN     "crew_id" INTEGER NOT NULL,
DROP COLUMN "event_assignment_id",
ADD COLUMN     "event_assignment_id" INTEGER NOT NULL,
ADD CONSTRAINT "crew_penalties_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "crew_profile_edit_requests" DROP CONSTRAINT "crew_profile_edit_requests_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "crew_id",
ADD COLUMN     "crew_id" INTEGER NOT NULL,
DROP COLUMN "reviewed_by_admin_id",
ADD COLUMN     "reviewed_by_admin_id" INTEGER,
ADD CONSTRAINT "crew_profile_edit_requests_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "crew_skills" DROP CONSTRAINT "crew_skills_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "crew_id",
ADD COLUMN     "crew_id" INTEGER NOT NULL,
ADD CONSTRAINT "crew_skills_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "crew_time_off" DROP CONSTRAINT "crew_time_off_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "crew_id",
ADD COLUMN     "crew_id" INTEGER NOT NULL,
ADD CONSTRAINT "crew_time_off_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "crew_wallets" DROP CONSTRAINT "crew_wallets_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "crew_id",
ADD COLUMN     "crew_id" INTEGER NOT NULL,
ADD CONSTRAINT "crew_wallets_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "crew_weekly_availability" DROP CONSTRAINT "crew_weekly_availability_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "crew_id",
ADD COLUMN     "crew_id" INTEGER NOT NULL,
ADD CONSTRAINT "crew_weekly_availability_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "event_crew_assignments" DROP CONSTRAINT "event_crew_assignments_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "booking_id",
ADD COLUMN     "booking_id" INTEGER NOT NULL,
DROP COLUMN "crew_id",
ADD COLUMN     "crew_id" INTEGER NOT NULL,
DROP COLUMN "assigned_by_admin_id",
ADD COLUMN     "assigned_by_admin_id" INTEGER,
ADD CONSTRAINT "event_crew_assignments_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "otp_verifications" DROP CONSTRAINT "otp_verifications_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "otp_verifications_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "payments" DROP CONSTRAINT "payments_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "booking_id",
ADD COLUMN     "booking_id" INTEGER NOT NULL,
ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "refresh_tokens" DROP CONSTRAINT "refresh_tokens_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "subject_id",
ADD COLUMN     "subject_id" INTEGER NOT NULL,
ADD CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "refunds" DROP CONSTRAINT "refunds_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "booking_id",
ADD COLUMN     "booking_id" INTEGER NOT NULL,
DROP COLUMN "payment_id",
ADD COLUMN     "payment_id" INTEGER NOT NULL,
ADD CONSTRAINT "refunds_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "reviews" DROP CONSTRAINT "reviews_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "booking_id",
ADD COLUMN     "booking_id" INTEGER NOT NULL,
DROP COLUMN "user_id",
ADD COLUMN     "user_id" INTEGER NOT NULL,
ADD CONSTRAINT "reviews_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "scheduled_reminders" DROP CONSTRAINT "scheduled_reminders_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "booking_id",
ADD COLUMN     "booking_id" INTEGER NOT NULL,
DROP COLUMN "recipient_id",
ADD COLUMN     "recipient_id" INTEGER NOT NULL,
ADD CONSTRAINT "scheduled_reminders_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "user_addresses" DROP CONSTRAINT "user_addresses_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "user_id",
ADD COLUMN     "user_id" INTEGER NOT NULL,
ADD CONSTRAINT "user_addresses_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "users" DROP CONSTRAINT "users_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "wallet_transactions" DROP CONSTRAINT "wallet_transactions_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "wallet_id",
ADD COLUMN     "wallet_id" INTEGER NOT NULL,
DROP COLUMN "event_assignment_id",
ADD COLUMN     "event_assignment_id" INTEGER,
ADD CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE INDEX "admin_audit_logs_admin_id_idx" ON "admin_audit_logs"("admin_id");

-- CreateIndex
CREATE INDEX "booking_crew_requirements_booking_id_idx" ON "booking_crew_requirements"("booking_id");

-- CreateIndex
CREATE INDEX "bookings_user_id_idx" ON "bookings"("user_id");

-- CreateIndex
CREATE INDEX "crew_bank_details_crew_id_idx" ON "crew_bank_details"("crew_id");

-- CreateIndex
CREATE UNIQUE INDEX "crew_date_blocks_crew_id_blocked_date_key" ON "crew_date_blocks"("crew_id", "blocked_date");

-- CreateIndex
CREATE INDEX "crew_identity_documents_crew_id_idx" ON "crew_identity_documents"("crew_id");

-- CreateIndex
CREATE INDEX "crew_languages_crew_id_idx" ON "crew_languages"("crew_id");

-- CreateIndex
CREATE INDEX "crew_penalties_crew_id_idx" ON "crew_penalties"("crew_id");

-- CreateIndex
CREATE INDEX "crew_profile_edit_requests_crew_id_idx" ON "crew_profile_edit_requests"("crew_id");

-- CreateIndex
CREATE INDEX "crew_skills_crew_id_idx" ON "crew_skills"("crew_id");

-- CreateIndex
CREATE INDEX "crew_time_off_crew_id_idx" ON "crew_time_off"("crew_id");

-- CreateIndex
CREATE UNIQUE INDEX "crew_wallets_crew_id_key" ON "crew_wallets"("crew_id");

-- CreateIndex
CREATE INDEX "crew_weekly_availability_crew_id_idx" ON "crew_weekly_availability"("crew_id");

-- CreateIndex
CREATE INDEX "event_crew_assignments_booking_id_idx" ON "event_crew_assignments"("booking_id");

-- CreateIndex
CREATE INDEX "event_crew_assignments_crew_id_idx" ON "event_crew_assignments"("crew_id");

-- CreateIndex
CREATE INDEX "payments_booking_id_idx" ON "payments"("booking_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_subject_type_subject_id_idx" ON "refresh_tokens"("subject_type", "subject_id");

-- CreateIndex
CREATE INDEX "refunds_booking_id_idx" ON "refunds"("booking_id");

-- CreateIndex
CREATE INDEX "reviews_booking_id_idx" ON "reviews"("booking_id");

-- CreateIndex
CREATE INDEX "scheduled_reminders_booking_id_idx" ON "scheduled_reminders"("booking_id");

-- CreateIndex
CREATE INDEX "user_addresses_user_id_idx" ON "user_addresses"("user_id");

-- CreateIndex
CREATE INDEX "wallet_transactions_wallet_id_idx" ON "wallet_transactions"("wallet_id");

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
