-- CreateTable
CREATE TABLE "mcp_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "token_prefix" VARCHAR(12) NOT NULL,
    "last_used_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_mcp_token_id" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_mcp_token_hash" ON "mcp_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "idx_mcp_token_user" ON "mcp_tokens"("user_id");

-- CreateIndex
CREATE INDEX "idx_mcp_token_user_active" ON "mcp_tokens"("user_id", "revoked_at");

-- AddForeignKey
ALTER TABLE "mcp_tokens" ADD CONSTRAINT "mcp_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
