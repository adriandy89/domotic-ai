import { DbService } from '@app/db';
import {
  EdgeBundle,
  EdgeDeviceMeta,
  EdgeRule,
  EdgeSchedule,
  ResultType,
  SignedEdgeBundle,
  signBundle,
} from '@app/rules-evaluator';

/**
 * Builds the offline rules bundle for a home from Postgres. This is the single
 * serializer used by BOTH the retained-MQTT publisher (mqtt-core) and the HTTP
 * pull endpoint (api), so the edge always gets an identical, signable payload.
 *
 * Only `run_offline` + `active` rules/schedules are included, and only COMMAND
 * results — notifications are never sent offline. Device metadata
 * (unique_id/protocol/attributes) is resolved here because the edge has no Postgres.
 */
export async function serializeEdgeBundle(
  db: DbService,
  homeUniqueId: string,
): Promise<EdgeBundle | null> {
  const home = await db.home.findUnique({
    where: { unique_id: homeUniqueId },
    select: {
      unique_id: true,
      organization_id: true,
      timezone: true,
      devices: {
        select: {
          id: true,
          unique_id: true,
          protocol: true,
          attributes: true,
        },
      },
      rules: {
        where: { active: true, run_offline: true },
        select: {
          id: true,
          name: true,
          type: true,
          active: true,
          all: true,
          interval: true,
          window_active: true,
          window_days: true,
          window_all_day: true,
          window_start: true,
          window_end: true,
          created_at: true,
          conditions: {
            select: {
              id: true,
              device_id: true,
              attribute: true,
              operation: true,
              data: true,
            },
          },
          results: {
            select: {
              id: true,
              device_id: true,
              event: true,
              attribute: true,
              data: true,
              type: true,
              channel: true,
              resend_after: true,
            },
          },
        },
      },
      schedules: {
        where: { active: true, run_offline: true },
        select: {
          id: true,
          name: true,
          active: true,
          date: true,
          frequency: true,
          days: true,
          actions: {
            select: { device_id: true, attribute: true, data: true },
          },
        },
      },
    },
  });

  if (!home) return null;

  const rules: EdgeRule[] = home.rules
    .map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    active: r.active,
    all: r.all,
    interval: r.interval,
    window_active: r.window_active,
    window_days: r.window_days,
    window_all_day: r.window_all_day,
    window_start: r.window_start,
    window_end: r.window_end,
    created_at: r.created_at.toISOString(),
    conditions: r.conditions.map((c) => ({
      id: c.id,
      device_id: c.device_id,
      attribute: c.attribute,
      operation: c.operation,
      data: c.data,
    })),
    // Offline only ever acts via COMMAND results.
    results: r.results
      .filter((res) => res.type === ResultType.COMMAND)
      .map((res) => ({
        id: res.id,
        device_id: res.device_id,
        event: res.event,
        attribute: res.attribute,
        data: res.data,
        type: res.type,
        channel: res.channel,
        resend_after: res.resend_after,
      })),
    }))
    // A rule with no COMMAND result does nothing offline (notifications are
    // central-only), so keep the bundle lean by dropping those.
    .filter((r) => r.results.length > 0);

  const schedules: EdgeSchedule[] = home.schedules.map((s) => ({
    id: s.id,
    name: s.name,
    active: s.active,
    date: s.date ? s.date.toISOString() : null,
    frequency: s.frequency,
    days: s.days,
    actions: s.actions.map((a) => ({
      device_id: a.device_id,
      attribute: a.attribute,
      data: a.data,
    })),
  }));

  // Ship only the devices the bundle references (keeps it small).
  const referenced = new Set<string>();
  for (const r of rules) {
    r.conditions.forEach((c) => referenced.add(c.device_id));
    r.results.forEach((res) => res.device_id && referenced.add(res.device_id));
  }
  for (const s of schedules) {
    s.actions.forEach((a) => a.device_id && referenced.add(a.device_id));
  }

  const devices: EdgeDeviceMeta[] = home.devices
    .filter((d) => referenced.has(d.id))
    .map((d) => ({
      id: d.id,
      uniqueId: d.unique_id,
      protocol: d.protocol,
      attributes: d.attributes,
    }));

  return {
    homeUniqueId: home.unique_id,
    organizationId: home.organization_id,
    timezone: home.timezone,
    version: Date.now(),
    devices,
    rules,
    schedules,
  };
}

/** Serialize + HMAC-sign for a home; null when the home doesn't exist. */
export async function buildSignedEdgeBundle(
  db: DbService,
  homeUniqueId: string,
  token: string,
): Promise<SignedEdgeBundle | null> {
  const bundle = await serializeEdgeBundle(db, homeUniqueId);
  return bundle ? signBundle(bundle, token) : null;
}
