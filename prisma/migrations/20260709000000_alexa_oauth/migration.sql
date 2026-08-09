-- CreateTable
CREATE TABLE "alexa_oauth_clients" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "client_id" VARCHAR(128) NOT NULL,
    "client_secret_hash" VARCHAR(64) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "redirect_uris" TEXT[],
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "pk_alexa_oauth_client_id" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alexa_auth_codes" (
    "code_hash" VARCHAR(64) NOT NULL,
    "client_id" VARCHAR(128) NOT NULL,
    "user_id" TEXT NOT NULL,
    "redirect_uri" TEXT NOT NULL,
    "scope" VARCHAR(256),
    "code_challenge" VARCHAR(128),
    "code_challenge_method" VARCHAR(10),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_alexa_auth_code_hash" PRIMARY KEY ("code_hash")
);

-- CreateTable
CREATE TABLE "alexa_access_tokens" (
    "token_hash" VARCHAR(64) NOT NULL,
    "client_id" VARCHAR(128) NOT NULL,
    "user_id" TEXT NOT NULL,
    "scope" VARCHAR(256),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_alexa_access_token_hash" PRIMARY KEY ("token_hash")
);

-- CreateTable
CREATE TABLE "alexa_refresh_tokens" (
    "token_hash" VARCHAR(64) NOT NULL,
    "client_id" VARCHAR(128) NOT NULL,
    "user_id" TEXT NOT NULL,
    "scope" VARCHAR(256),
    "revoked_at" TIMESTAMPTZ(6),
    "last_used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_alexa_refresh_token_hash" PRIMARY KEY ("token_hash")
);

-- CreateTable
CREATE TABLE "alexa_event_grants" (
    "user_id" TEXT NOT NULL,
    "grant_code_encrypted" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "pk_alexa_event_grant_user" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_alexa_oauth_client_org" ON "alexa_oauth_clients"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_alexa_oauth_client_client_id" ON "alexa_oauth_clients"("client_id");

-- CreateIndex
CREATE INDEX "idx_alexa_auth_code_user" ON "alexa_auth_codes"("user_id");

-- CreateIndex
CREATE INDEX "idx_alexa_auth_code_expires" ON "alexa_auth_codes"("expires_at");

-- CreateIndex
CREATE INDEX "idx_alexa_access_token_user" ON "alexa_access_tokens"("user_id");

-- CreateIndex
CREATE INDEX "idx_alexa_access_token_expires" ON "alexa_access_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "idx_alexa_refresh_token_user" ON "alexa_refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "idx_alexa_refresh_token_user_active" ON "alexa_refresh_tokens"("user_id", "revoked_at");

-- AddForeignKey
ALTER TABLE "alexa_oauth_clients" ADD CONSTRAINT "alexa_oauth_clients_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "alexa_auth_codes" ADD CONSTRAINT "alexa_auth_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "alexa_access_tokens" ADD CONSTRAINT "alexa_access_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "alexa_refresh_tokens" ADD CONSTRAINT "alexa_refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "alexa_event_grants" ADD CONSTRAINT "alexa_event_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
