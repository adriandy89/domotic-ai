-- AlterTable: per-device online/availability flag. Existing rows default to online.
ALTER TABLE "devices" ADD COLUMN "online" BOOLEAN DEFAULT true;
