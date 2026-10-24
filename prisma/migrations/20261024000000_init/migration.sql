-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "recipient_to" TEXT NOT NULL,
    "text_content" TEXT NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'QUEUED',
    "queued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_events" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "status" "EventStatus" NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "messages_tenant_id_conversation_id_created_at_id_idx" ON "messages"("tenant_id", "conversation_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "messages_tenant_id_id_idx" ON "messages"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "provider_events_event_id_key" ON "provider_events"("event_id");

-- CreateIndex
CREATE INDEX "provider_events_message_id_idx" ON "provider_events"("message_id");

-- AddForeignKey
ALTER TABLE "provider_events" ADD CONSTRAINT "provider_events_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
