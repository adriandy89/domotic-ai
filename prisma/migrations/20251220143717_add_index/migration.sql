/*
  Warnings:

  - A unique constraint covering the columns `[unique_id,organization_id]` on the table `devices` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "devices_unique_id_key";

-- CreateIndex
CREATE INDEX "idx_condition_rule" ON "conditions"("rule_id");

-- CreateIndex
CREATE INDEX "idx_condition_device" ON "conditions"("device_id");

-- CreateIndex
CREATE INDEX "idx_device_learned_commands_device" ON "device_learned_commands"("device_id");

-- CreateIndex
CREATE INDEX "idx_device_home" ON "devices"("home_id");

-- CreateIndex
CREATE INDEX "idx_device_disabled" ON "devices"("disabled");

-- CreateIndex
CREATE INDEX "idx_device_organization_disabled" ON "devices"("organization_id", "disabled");

-- CreateIndex
CREATE INDEX "idx_device_home_disabled" ON "devices"("home_id", "disabled");

-- CreateIndex
CREATE UNIQUE INDEX "uq_devices_uniqueid_organization" ON "devices"("unique_id", "organization_id");

-- CreateIndex
CREATE INDEX "idx_home_disabled" ON "homes"("disabled");

-- CreateIndex
CREATE INDEX "idx_home_connected" ON "homes"("connected");

-- CreateIndex
CREATE INDEX "idx_home_organization_disabled" ON "homes"("organization_id", "disabled");

-- CreateIndex
CREATE INDEX "idx_result_rule" ON "results"("rule_id");

-- CreateIndex
CREATE INDEX "idx_result_device" ON "results"("device_id");

-- CreateIndex
CREATE INDEX "idx_rule_user" ON "rules"("user_id");

-- CreateIndex
CREATE INDEX "idx_rule_home" ON "rules"("home_id");

-- CreateIndex
CREATE INDEX "idx_rule_active" ON "rules"("active");

-- CreateIndex
CREATE INDEX "idx_rule_user_active" ON "rules"("user_id", "active");

-- CreateIndex
CREATE INDEX "idx_rule_home_active" ON "rules"("home_id", "active");

-- CreateIndex
CREATE INDEX "idx_schedule_action_schedule" ON "schedule_actions"("schedule_id");

-- CreateIndex
CREATE INDEX "idx_schedule_action_device" ON "schedule_actions"("device_id");

-- CreateIndex
CREATE INDEX "idx_schedule_user" ON "schedules"("user_id");

-- CreateIndex
CREATE INDEX "idx_schedule_home" ON "schedules"("home_id");

-- CreateIndex
CREATE INDEX "idx_schedule_active" ON "schedules"("active");

-- CreateIndex
CREATE INDEX "idx_schedule_user_active" ON "schedules"("user_id", "active");

-- CreateIndex
CREATE INDEX "idx_schedule_home_active" ON "schedules"("home_id", "active");
