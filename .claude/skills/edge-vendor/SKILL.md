---
name: edge-vendor
description: Úsala cuando cambies libs/rules-evaluator o libs/models/src/device/protocols (lógica compartida con el motor offline de la Orange Pi), o cuando falle el workflow "edge vendor drift". Explica cómo re-vendorizar al proyecto stack-client/edge/rules-engine sin romper la separación cliente/plataforma.
---

# Vendor-copy al edge

El motor offline (`stack-client/edge/rules-engine`) es un proyecto independiente que
corre en la casa del cliente: NO importa `@app/*`. La lógica pura compartida vive una
sola vez en:

- `libs/rules-evaluator/src` (evaluación de reglas, ventanas de ejecución, HMAC…)
- `libs/models/src/device/protocols` (adapters protocolo → MQTT)

y se COPIA a `stack-client/edge/rules-engine/src/vendor/` (commiteado, para que el build
Docker sea autocontenido).

## Flujo

1. Edita SOLO los originales en `libs/` (nunca `src/vendor/`). Mantén esas libs puras:
   sin Prisma, sin Nest, sin imports `@app/*` fuera de ellas mismas.
2. Tests del monorepo: `pnpm test libs/rules-evaluator libs/models`.
3. Re-vendoriza y comprueba:
   ```bash
   cd stack-client/edge/rules-engine
   pnpm vendor          # bash scripts/vendor-libs.sh
   pnpm vendor:check    # debe salir limpio
   pnpm exec tsc --noEmit -p tsconfig.json && pnpm test
   ```
4. Commitea originales + `src/vendor/` en el mismo commit.

Si el cambio afecta al contrato del bundle edge (`libs/edge-bundle`) o a topics MQTT,
revisa también `apps/mqtt-core` (publicación retenida en `home/id/{uuid}/edge/rules`) y
los specs `libs/edge-bundle/src/*.spec.ts`.
