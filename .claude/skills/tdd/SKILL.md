---
name: tdd
description: Fase 3 de la metodología. Úsala al implementar cualquier tarea de un plan, un bugfix o un cambio de comportamiento en domotic-ai — test rojo primero, luego el código mínimo, luego verde y refactor. Incluye los patrones de test del repo (jest + ts-jest, mocks de DbService, lógica pura).
---

# TDD en domotic-ai

## Ciclo por tarea

1. **Rojo**: escribe/extiende el spec y ejecútalo → debe fallar por la razón correcta.
   `pnpm test <ruta-del-spec>`
2. **Verde**: el cambio mínimo que lo hace pasar.
3. **Refactor** con los tests en verde.
4. **Tipos**: ts-jest NO comprueba tipos. Ejecuta siempre
   `pnpm exec tsc --noEmit -p tsconfig.json` (o el tsconfig de la app/lib).
5. Marca la tarea en el plan y pasa a la siguiente.

Para bugs: primero un test que reproduzca el bug (debe fallar), luego el fix.

## Patrones del repo

- **Lógica pura sin Nest** siempre que se pueda: mapeos, validaciones, cálculos →
  funciones exportadas con specs directos. Ejemplos: `apps/api/src/alexa/mapping/*.spec.ts`,
  `libs/rules-evaluator/src/*.spec.ts`, `libs/models/src/device/protocols/**/**.spec.ts`.
- **Servicios con BD**: instancia la clase con un `DbService` falso hecho a mano que
  solo implemente los métodos usados (`jest.fn()`), p.ej.
  `apps/api/src/alexa/oauth/alexa-oauth.service.spec.ts`, `alexa-token.service.spec.ts`.
  `$transaction: jest.fn((ops) => Promise.all(ops))`.
- **Clientes externos** (Redis, Mastra, MQTT): inyecta/sustituye el cliente
  (`(svc as any).client = fake`) o `jest.mock('<paquete>')`, ver
  `libs/cache/src/cache.service.spec.ts`, `apps/ai-service/src/mastra/mastra-agent.factory.spec.ts`.
- **Aliases**: `@app/*` se resuelven por `moduleNameMapper` en `package.json` (jest). Si
  creas una lib nueva, añade su alias allí y en `tsconfig.json`.
- **Edge / lan-bridge**: tienen su propio jest (`cd stack-client/... && pnpm test`).
- Casos obligatorios: camino feliz, entrada inválida/desconocida (fallar cerrado),
  aislamiento multi-tenant (otra organización / otra casa → rechazo).

## Delegar

Para lotes de tests de una pieza ya diseñada, usa el agente `test-writer` pasándole
la ruta del código y los casos. Revisa su salida: los tests deben fallar sin el código.
