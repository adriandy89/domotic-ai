---
name: spec
description: Fase 1 de la metodología. Úsala al empezar cualquier feature o cambio no trivial en domotic-ai (nueva integración, regla, pantalla, protocolo, cambio de esquema) ANTES de escribir código. Convierte una idea en un spec de diseño aprobado en docs/superpowers/specs/.
---

# Spec de diseño

Objetivo: acordar QUÉ y POR QUÉ antes del CÓMO. Sin código en esta fase.

## Pasos

1. **Contexto real primero.** Lee `CLAUDE.md`, el backlog `docs/status/` y explora el
   código afectado (agente `Explore` si son muchas carpetas). Busca utilidades existentes
   que reutilizar (adapters en `libs/models/src/device/protocols`, tools en
   `libs/ai-tools`, stores en `web/src/store`).
2. **Preguntas que bloquean.** Usa `AskUserQuestion` solo para decisiones del usuario
   (alcance, UX, compatibilidad, trade-offs). Ofrece una opción recomendada.
3. **Escribe el spec** en `docs/superpowers/specs/AAAA-MM-DD-<slug>-design.md` con:
   - **Problema** (qué duele hoy, con rutas de fichero).
   - **Solución** (comportamiento observable, no implementación línea a línea).
   - **Alcance / fuera de alcance.**
   - **Impacto por capa**: Prisma (¿migración? → skill `prisma-migration`), API,
     mqtt-core/rules-engine, edge (¿toca `libs/rules-evaluator` o protocols? → re-vendor),
     web (componentes + i18n en/es/fr), IA (tools), seguridad multi-tenant.
   - **Riesgos y compatibilidad** (datos existentes, dispositivos reales, producción).
   - **Criterios de aceptación** verificables (tests concretos, e2e con `local-stack`).
4. **Aprobación explícita.** Resume el spec al usuario y pide OK. Anota en el spec
   "Aprobado por el usuario el AAAA-MM-DD" + decisiones tomadas.
5. Siguiente fase: skill `plan`.

## Ejemplo de referencia
`docs/superpowers/specs/2026-07-17-rule-help-panel-design.md`.
