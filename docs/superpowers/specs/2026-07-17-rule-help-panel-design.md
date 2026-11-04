# Rule form help panel — design

Approved by the user on 2026-07-17 (format: side panel; opening: manual only).

## Problem

The rule form (`web/src/pages/RuleFormPage.tsx`) has grown many concepts (type,
wait-for-true interval, AND/OR, offline execution, per-condition trigger,
execution window, result types). New users have no in-product explanation.

## Solution

A help icon button (`HelpCircle`) in the page header, right-aligned with the
"Editar/Crear regla" title. It toggles a **non-modal side panel** (new
component `web/src/components/rule/RuleHelpPanel.tsx`) so the user can read the
guide while editing the form.

### Panel behavior

- Rendered via `createPortal`; fixed right, full height, ~420 px on `md+`
  (no overlay, form stays interactive), full width with dark overlay on mobile.
- Slide-in animation (new `slide-in-right` keyframes in `index.css`,
  disabled under `prefers-reduced-motion`). `Esc` and the X button close it.
- Opens manually only; no persistence, no auto-open.

### Content

Accordion (single section open at a time, chevron + `aria-expanded`), sections
color-coded to mirror the form cards:

1. **What is a rule?** — WHEN→THEN mental model with an icon flow strip
   (sensor data → conditions → actions), the signature visual of the panel.
2. **Basic information** — type (recurrent/once), wait-for-true interval,
   active, All/Any (AND/OR), run offline.
3. **Conditions** — row anatomy (device→attribute→operator→value), absence
   operators, and the per-condition **Trigger** switch with the door+lux example.
4. **When to run** — execution window, home timezone, overnight ranges.
5. **Results / actions** — send action vs notification, channels, external
   recipients.
6. **Full example** — numbered recipe (button press → light on).

Initially expanded: *Conditions* when the form already has conditions,
otherwise *What is a rule?*.

All copy in i18n under `rules.help.*` (en defines `RulesNS`, then es/fr).
No new dependencies; accordion is local state. Frontend-only change.
