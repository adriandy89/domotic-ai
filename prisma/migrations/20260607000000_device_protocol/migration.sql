-- AlterTable: add protocol discriminator. Existing rows are Zigbee.
ALTER TABLE "devices" ADD COLUMN "protocol" VARCHAR(32) NOT NULL DEFAULT 'zigbee';

-- CreateIndex
CREATE INDEX "idx_device_organization_protocol" ON "devices" ("organization_id", "protocol");
