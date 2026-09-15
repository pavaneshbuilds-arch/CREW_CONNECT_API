-- CreateEnum
CREATE TYPE "DeviceDetachReason" AS ENUM ('token_rotated', 'unregistered', 'reassigned', 'replaced');

-- CreateTable
CREATE TABLE "devices" (
    "id" SERIAL NOT NULL,
    "subject_type" "AuthSubjectType" NOT NULL,
    "subject_id" INTEGER NOT NULL,
    "mid" VARCHAR(255) NOT NULL,
    "pnid" VARCHAR(512) NOT NULL,
    "platform" VARCHAR(30),
    "device_name" VARCHAR(150),
    "os_version" VARCHAR(50),
    "app_version" VARCHAR(50),
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_history" (
    "id" SERIAL NOT NULL,
    "subject_type" "AuthSubjectType" NOT NULL,
    "subject_id" INTEGER NOT NULL,
    "mid" VARCHAR(255) NOT NULL,
    "pnid" VARCHAR(512) NOT NULL,
    "platform" VARCHAR(30),
    "device_name" VARCHAR(150),
    "os_version" VARCHAR(50),
    "app_version" VARCHAR(50),
    "attached_at" TIMESTAMPTZ(6) NOT NULL,
    "detached_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" "DeviceDetachReason" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "devices_pnid_key" ON "devices"("pnid");

-- CreateIndex
CREATE INDEX "devices_subject_type_subject_id_idx" ON "devices"("subject_type", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "devices_mid_key" ON "devices"("mid");

-- CreateIndex
CREATE INDEX "device_history_subject_type_subject_id_detached_at_idx" ON "device_history"("subject_type", "subject_id", "detached_at");

-- CreateIndex
CREATE INDEX "device_history_mid_idx" ON "device_history"("mid");
