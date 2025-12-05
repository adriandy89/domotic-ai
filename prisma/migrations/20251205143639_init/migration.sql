-- CreateEnum
CREATE TYPE "Role" AS ENUM ('GUEST', 'USER', 'MANAGER', 'ADMIN');

-- CreateEnum
CREATE TYPE "Operation" AS ENUM ('EQ', 'GT', 'GTE', 'LT', 'LTE');

-- CreateEnum
CREATE TYPE "RuleType" AS ENUM ('ONCE', 'RECURRENT', 'SPECIFIC');

-- CreateEnum
CREATE TYPE "ResultType" AS ENUM ('COMMAND', 'NOTIFICATION');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'SMS', 'PUSH', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "ScheduleFrequency" AS ENUM ('ONCE', 'DAILY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ScheduleDays" AS ENUM ('SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT ('now'::text)::timestamp with time zone,
    "updated_at" TIMESTAMPTZ(6),
    "name" TEXT NOT NULL,
    "attributes" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "max_homes" INTEGER NOT NULL DEFAULT 2,
    "max_users" INTEGER NOT NULL DEFAULT 2,
    "max_devices" INTEGER NOT NULL DEFAULT 10,

    CONSTRAINT "pk_organization_id" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homes" (
    "id" TEXT NOT NULL,
    "unique_id" VARCHAR(128) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "mqtt_password" VARCHAR(256),
    "mqtt_username" VARCHAR(256),
    "mqtt_id" VARCHAR(256),
    "description" VARCHAR(512),
    "icon" VARCHAR(512),
    "image" VARCHAR(512),
    "attributes" JSONB,
    "disabled" BOOLEAN DEFAULT false,
    "connected" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT ('now'::text)::timestamp with time zone,
    "updated_at" TIMESTAMPTZ(6),
    "last_update" TIMESTAMPTZ(6),
    "organization_id" TEXT NOT NULL,

    CONSTRAINT "pk_home_id" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "is_org_admin" BOOLEAN NOT NULL DEFAULT false,
    "email" VARCHAR NOT NULL,
    "password" VARCHAR(128),
    "name" VARCHAR(128) NOT NULL,
    "phone" VARCHAR(128),
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT ('now'::text)::timestamp with time zone,
    "updated_at" TIMESTAMPTZ(6),
    "attributes" JSONB,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "expiration_time" TIMESTAMPTZ(6),
    "notification_batch_minutes" INTEGER DEFAULT 5,
    "fmc_tokens" TEXT[],
    "telegram_chat_id" VARCHAR(128),
    "organization_id" TEXT NOT NULL,
    "channels" "NotificationChannel"[],

    CONSTRAINT "pk_user_id" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" TEXT NOT NULL,
    "unique_id" VARCHAR(128) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "model" VARCHAR(128),
    "category" VARCHAR(128),
    "description" VARCHAR(512),
    "icon" VARCHAR(512),
    "attributes" JSONB,
    "disabled" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT ('now'::text)::timestamp with time zone,
    "updated_at" TIMESTAMPTZ(6),
    "organization_id" TEXT NOT NULL,
    "x" DOUBLE PRECISION DEFAULT 0,
    "y" DOUBLE PRECISION DEFAULT 0,
    "show_on_map" BOOLEAN DEFAULT false,
    "home_id" TEXT,

    CONSTRAINT "pk_device_id" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sensor_data" (
    "id" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT ('now'::text)::timestamp with time zone,
    "device_id" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "sensor_data_last" (
    "data" JSONB NOT NULL,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT ('now'::text)::timestamp with time zone,
    "device_id" TEXT NOT NULL,

    CONSTRAINT "pk_sensor_data_last_device" PRIMARY KEY ("device_id")
);

-- CreateTable
CREATE TABLE "users_homes" (
    "user_id" TEXT NOT NULL,
    "home_id" TEXT NOT NULL,

    CONSTRAINT "users_homes_pkey" PRIMARY KEY ("user_id","home_id")
);

-- CreateTable
CREATE TABLE "rules" (
    "id" TEXT NOT NULL,
    "type" "RuleType" NOT NULL DEFAULT 'RECURRENT',
    "name" VARCHAR(128) NOT NULL DEFAULT 'Rule',
    "description" VARCHAR(512),
    "active" BOOLEAN NOT NULL DEFAULT false,
    "all" BOOLEAN NOT NULL DEFAULT true,
    "interval" INTEGER NOT NULL DEFAULT 0,
    "timestamp" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT ('now'::text)::timestamp with time zone,
    "updated_at" TIMESTAMPTZ(6),
    "user_id" TEXT NOT NULL,
    "home_id" TEXT NOT NULL,

    CONSTRAINT "pk_rule_id" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conditions" (
    "id" TEXT NOT NULL,
    "operation" "Operation" NOT NULL,
    "attribute" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "device_id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,

    CONSTRAINT "pk_condition_id" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "results" (
    "id" TEXT NOT NULL,
    "event" VARCHAR(1024) NOT NULL,
    "type" "ResultType" NOT NULL DEFAULT 'COMMAND',
    "attribute" VARCHAR(254),
    "resend_after" INTEGER DEFAULT 10,
    "channel" "NotificationChannel"[],
    "data" JSONB,
    "device_id" TEXT,
    "rule_id" TEXT NOT NULL,

    CONSTRAINT "pk_result_id" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedules" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "date" TIMESTAMPTZ(6),
    "frequency" "ScheduleFrequency" NOT NULL,
    "days" "ScheduleDays"[],
    "channel" "NotificationChannel"[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT ('now'::text)::timestamp with time zone,
    "updated_at" TIMESTAMPTZ(6),
    "user_id" TEXT NOT NULL,
    "home_id" TEXT NOT NULL,

    CONSTRAINT "pk_schedule_id" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_actions" (
    "id" TEXT NOT NULL,
    "device_id" TEXT,
    "attribute" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "schedule_id" TEXT NOT NULL,

    CONSTRAINT "pk_schedule_action_id" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_learned_commands" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "command" VARCHAR(2048) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT ('now'::text)::timestamp with time zone,
    "updated_at" TIMESTAMPTZ(6),
    "device_id" TEXT NOT NULL,

    CONSTRAINT "pk_device_learned_commands_id" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_accounts" (
    "id" TEXT NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "provider_id" VARCHAR(255) NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "token_expiry" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT ('now'::text)::timestamp with time zone,
    "updated_at" TIMESTAMPTZ(6),
    "user_id" TEXT NOT NULL,

    CONSTRAINT "pk_oauth_account_id" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "homes_unique_id_key" ON "homes"("unique_id");

-- CreateIndex
CREATE INDEX "idx_home_name" ON "homes"("name");

-- CreateIndex
CREATE INDEX "idx_home_uniqueid" ON "homes"("unique_id");

-- CreateIndex
CREATE INDEX "idx_home_organization" ON "homes"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_user_email" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_user_name" ON "users"("name");

-- CreateIndex
CREATE INDEX "idx_user_email" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_user_organization" ON "users"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "devices_unique_id_key" ON "devices"("unique_id");

-- CreateIndex
CREATE INDEX "idx_devices_uniqueid" ON "devices"("unique_id");

-- CreateIndex
CREATE INDEX "idx_device_organization" ON "devices"("organization_id");

-- CreateIndex
CREATE INDEX "idx_sensor_data_id" ON "sensor_data"("id");

-- CreateIndex
CREATE INDEX "idx_sensor_data_device" ON "sensor_data"("device_id");

-- CreateIndex
CREATE INDEX "idx_sensor_data_timestamp" ON "sensor_data"("timestamp");

-- CreateIndex
CREATE INDEX "idx_sensor_data_device_timestamp" ON "sensor_data"("device_id", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "uq_sensor_data_timestamp_id" ON "sensor_data"("timestamp", "id");

-- CreateIndex
CREATE INDEX "idx_sensor_data_last_timestamp" ON "sensor_data_last"("timestamp");

-- CreateIndex
CREATE INDEX "idx_sensor_data_last_device_timestamp" ON "sensor_data_last"("device_id", "timestamp");

-- CreateIndex
CREATE INDEX "idx_user_home_user" ON "users_homes"("user_id");

-- CreateIndex
CREATE INDEX "idx_user_home_home" ON "users_homes"("home_id");

-- CreateIndex
CREATE INDEX "idx_oauth_user" ON "oauth_accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_oauth_provider_id" ON "oauth_accounts"("provider", "provider_id");

-- AddForeignKey
ALTER TABLE "homes" ADD CONSTRAINT "homes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_home_id_fkey" FOREIGN KEY ("home_id") REFERENCES "homes"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sensor_data" ADD CONSTRAINT "sensor_data_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sensor_data_last" ADD CONSTRAINT "sensor_data_last_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "users_homes" ADD CONSTRAINT "users_homes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "users_homes" ADD CONSTRAINT "users_homes_home_id_fkey" FOREIGN KEY ("home_id") REFERENCES "homes"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rules" ADD CONSTRAINT "rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rules" ADD CONSTRAINT "rules_home_id_fkey" FOREIGN KEY ("home_id") REFERENCES "homes"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "conditions" ADD CONSTRAINT "conditions_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "conditions" ADD CONSTRAINT "conditions_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "rules"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "rules"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_home_id_fkey" FOREIGN KEY ("home_id") REFERENCES "homes"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "schedule_actions" ADD CONSTRAINT "schedule_actions_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "schedule_actions" ADD CONSTRAINT "schedule_actions_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "schedules"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "device_learned_commands" ADD CONSTRAINT "device_learned_commands_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
