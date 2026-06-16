-- AlterTable: per-user preferred language (ISO 639-1) for UI and notifications.
-- Existing rows backfill to the default 'en'.
ALTER TABLE "users" ADD COLUMN "language" VARCHAR(5) NOT NULL DEFAULT 'en';
