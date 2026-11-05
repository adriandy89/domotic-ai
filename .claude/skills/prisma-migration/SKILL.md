---
name: prisma-migration
description: Úsala SIEMPRE que haya que cambiar prisma/schema.prisma o crear una migración en domotic-ai. TimescaleDB hace que `prisma migrate dev` detecte drift y proponga RESET (borrado de datos); esta skill describe el procedimiento seguro.
---

# Migraciones Prisma con TimescaleDB

**Prohibido:** `prisma migrate dev`, `prisma migrate reset`, `prisma db push`,
renombrar/editar migraciones ya aplicadas (romperían `_prisma_migrations` en las BDs
que ya las tienen; p.ej. `20260709000000_alexa_oauth` ya está aplicada en entornos
existentes aunque su timestamp sea anterior a `20260717...`).

## Procedimiento

1. Edita `prisma/schema.prisma`.
2. Genera el SQL candidato contra la BD **dev** (aislada) sin aplicarlo:
   ```bash
   source scripts/dev/env.sh
   pnpm exec prisma migrate diff \
     --from-config-datasource --to-schema prisma/schema.prisma --script > /tmp/candidate.sql
   ```
   **Revisa a mano**: aun sin cambios, el diff tiene ~32 sentencias de RUIDO conocido
   (medido 2026-11-04 sobre una BD recién migrada) que debes DESCARTAR:
   - `DROP/CREATE INDEX idx_*_at` (las migraciones los crean `DESC`, el schema no dice `sort: Desc`)
   - `RENAME CONSTRAINT pk_*/fk_*` (nombres puestos en SQL que el schema no mapea)
   - `DROP INDEX *_bucket_idx` / `device_state_events_timestamp_idx` (índices automáticos de hypertables)
   - `ALTER TABLE "rules" ALTER COLUMN "window_days" DROP DEFAULT`
   - cualquier cosa sobre hypertables/caggs/jobs (`sensor_data`, `sensor_hourly/daily`,
     `sensor_field_*`, `device_state_events`).
   Deja solo las sentencias de tu cambio.
3. Crea `prisma/migrations/<AAAAMMDDHHMMSS>_<nombre>/migration.sql` con un timestamp
   POSTERIOR a la última migración existente.
   - Enums: `ALTER TYPE "X" ADD VALUE IF NOT EXISTS '...';` (no corre en transacción).
   - Preferir `IF NOT EXISTS` y cambios aditivos; columnas NOT NULL con `DEFAULT`.
4. Aplica en dev: `make dev-db` (ejecuta `prisma migrate deploy` contra `domotic_dev`).
   Debe decir "All migrations have been successfully applied".
5. `pnpm exec prisma generate` y `pnpm exec tsc --noEmit -p tsconfig.json`.
6. Producción / otras BDs: `prisma migrate deploy` (lo hace el contenedor
   `prisma-migrate` del docker-compose raíz). Si una BD tiene drift manual, aplicar el
   SQL a mano y `prisma migrate resolve --applied <nombre>`.

## Comprobar una BD sin modificarla

Script `pg` de solo lectura (no hay `psql` en el host):
`select migration_name, finished_at from _prisma_migrations order by 1 desc limit 5;`
y `pg_constraint` / `pg_indexes` para validar PKs/índices esperados.

Hallazgo conocido (2026-11-04): la BD local `domotic` no tiene las PK de
`sensor_field_hourly/daily` (el job `refresh_sensor_field_stats` falla con "no unique or
exclusion constraint matching the ON CONFLICT") y le falta `20260717000000_add_condition_trigger`.
