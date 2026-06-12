-- =============================================================================
--  Pricing provider credentials: app-wide API tokens for market price sources
--  (ESIOS PVPC, ENTSO-E, ...), managed from Settings -> Energy by ADMINs.
--
--  One row per provider source. token_encrypted holds an AES-256-GCM envelope
--  (iv.tag.ct, base64) sealed with INTEGRATIONS_ENCRYPTION_KEY — same scheme
--  as xiaozhi_integrations.endpoint_encrypted. When no row exists the API
--  falls back to the ESIOS_API_TOKEN / ENTSOE_API_TOKEN env vars, so existing
--  deployments keep working unchanged.
-- =============================================================================

CREATE TABLE IF NOT EXISTS "pricing_provider_credentials" (
  "source"          VARCHAR(24)    NOT NULL,
  "token_encrypted" TEXT           NOT NULL,
  "created_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT ('now'::text)::timestamp with time zone,
  "updated_at"      TIMESTAMPTZ(6),
  CONSTRAINT "pk_pricing_provider_credential" PRIMARY KEY ("source")
);
