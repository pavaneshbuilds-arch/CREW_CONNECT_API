-- CreateEnum
CREATE TYPE "ActivityLogCategory" AS ENUM ('login', 'admin_action', 'payment', 'crew_redemption', 'crew_earning', 'penalty');

-- CreateEnum
CREATE TYPE "ActivityActorType" AS ENUM ('user', 'crew', 'admin', 'system');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('booking_confirmed', 'crew_on_the_way', 'rate_experience', 'new_job_request', 'offer', 'reminder');

-- DropForeignKey
ALTER TABLE "refunds" DROP CONSTRAINT "refunds_payment_id_fkey";

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" SERIAL NOT NULL,
    "category" "ActivityLogCategory" NOT NULL,
    "actor_type" "ActivityActorType" NOT NULL,
    "actor_id" INTEGER,
    "action" VARCHAR(100) NOT NULL,
    "reference_entity_type" VARCHAR(50),
    "reference_entity_id" INTEGER,
    "metadata" JSONB,
    "month_bucket" VARCHAR(7) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "recipient_type" "AuthSubjectType" NOT NULL,
    "recipient_id" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "reference_entity_type" VARCHAR(50),
    "reference_entity_id" INTEGER,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crew_sos_contacts" (
    "id" SERIAL NOT NULL,
    "crew_id" INTEGER NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "phone" VARCHAR(15) NOT NULL,
    "relation" VARCHAR(50),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "crew_sos_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activity_logs_month_bucket_category_idx" ON "activity_logs"("month_bucket", "category");

-- CreateIndex
CREATE INDEX "activity_logs_actor_id_created_at_idx" ON "activity_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "activity_logs_created_at_idx" ON "activity_logs"("created_at");

-- CreateIndex
CREATE INDEX "notifications_recipient_type_recipient_id_created_at_idx" ON "notifications"("recipient_type", "recipient_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_recipient_id_is_read_idx" ON "notifications"("recipient_id", "is_read");

-- CreateIndex
CREATE INDEX "crew_sos_contacts_crew_id_idx" ON "crew_sos_contacts"("crew_id");

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crew_sos_contacts" ADD CONSTRAINT "crew_sos_contacts_crew_id_fkey" FOREIGN KEY ("crew_id") REFERENCES "crew_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
