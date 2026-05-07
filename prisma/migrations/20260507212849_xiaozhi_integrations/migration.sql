-- CreateTable
CREATE TABLE "xiaozhi_integrations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "endpoint_encrypted" TEXT NOT NULL,
    "endpoint_prefix" VARCHAR(64) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "connection_state" VARCHAR(16) NOT NULL DEFAULT 'idle',
    "last_error" VARCHAR(512),
    "last_connected_at" TIMESTAMPTZ(6),
    "last_disconnected_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "pk_xiaozhi_integration_id" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_xiaozhi_integration_user" ON "xiaozhi_integrations"("user_id");

-- CreateIndex
CREATE INDEX "idx_xiaozhi_integration_enabled_user" ON "xiaozhi_integrations"("enabled", "user_id");

-- AddForeignKey
ALTER TABLE "xiaozhi_integrations" ADD CONSTRAINT "xiaozhi_integrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
