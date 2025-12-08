export const EventGeofenceOptions = {
  enter: 'enter',
  exit: 'exit',
  cross: 'cross',
  inside: 'inside',
  outside: 'outside',
} as const;

export type EventGeofenceTypes =
  (typeof EventGeofenceOptions)[keyof typeof EventGeofenceOptions];

export const EVENTS_GEOFENCE_TYPE = Object.values(
  EventGeofenceOptions,
) as EventGeofenceTypes[];
