-- CreateEnum
CREATE TYPE "FilePurpose" AS ENUM ('profile_photo', 'aadhaar_front', 'aadhaar_back', 'pan_card', 'other');

-- CreateTable
CREATE TABLE "app_install_tokens" (
    "id" SERIAL NOT NULL,
    "mid" VARCHAR(255) NOT NULL,
    "token_hash" VARCHAR(512) NOT NULL,
    "platform" VARCHAR(30),
    "app_version" VARCHAR(50),
    "is_revoked" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "last_used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "app_install_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uploaded_files" (
    "id" SERIAL NOT NULL,
    "subject_type" "AuthSubjectType" NOT NULL,
    "subject_id" INTEGER NOT NULL,
    "purpose" "FilePurpose" NOT NULL,
    "original_name" VARCHAR(255),
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "storage_key" VARCHAR(500) NOT NULL,
    "url" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uploaded_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_install_tokens_mid_key" ON "app_install_tokens"("mid");

-- CreateIndex
CREATE UNIQUE INDEX "app_install_tokens_token_hash_key" ON "app_install_tokens"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "uploaded_files_storage_key_key" ON "uploaded_files"("storage_key");

-- CreateIndex
CREATE INDEX "uploaded_files_subject_type_subject_id_purpose_idx" ON "uploaded_files"("subject_type", "subject_id", "purpose");
