---
name: plan
description: Fase 2 de la metodología. Úsala cuando haya un spec aprobado (docs/superpowers/specs/) para convertirlo en un plan de implementación por tareas pequeñas, testeables y ordenadas en docs/superpowers/plans/.
---

# Plan de implementación

Entrada: spec aprobado. Salida: `docs/superpowers/plans/AAAA-MM-DD-<slug>.md`.

## Estructura del plan

```markdown
# Plan: <título>   (spec: docs/superpowers/specs/...)

## Tareas
### T1 — <verbo + resultado>  [capa: libs/models | api | web | prisma | edge ...]
- Ficheros: rutas exactas a crear/modificar (y utilidades existentes a reutilizar)
- Test primero: qué spec (ruta) y qué casos (incluye el caso de fallo/fallar-cerrado)
- Hecho cuando: comando concreto que lo demuestra (jest <ruta>, tsc, curl…)
### T2 — ...

## Orden y dependencias
## Verificación final (e2e)
## Riesgos / rollback
```

## Reglas

- Tareas de ≤ ~1h, cada una deja el repo verde (`make verify` o el subconjunto relevante).
- Orden típico: tipos/lógica pura en `libs/` → servicio/controlador → web (+i18n) →
  migración Prisma al principio si hay cambios de esquema.
- Si toca `libs/rules-evaluator` o `libs/models/src/device/protocols`: añade tarea de
  re-vendor (skill `edge-vendor`).
- Si toca runtime (MQTT, NATS, BullMQ, OAuth): añade verificación e2e con `local-stack`.
- Paraleliza tareas independientes solo si no comparten ficheros (worktrees).
- Muestra el plan al usuario antes de ejecutar si el spec dejó decisiones abiertas.

Siguiente fase: skill `tdd`, tarea a tarea.
