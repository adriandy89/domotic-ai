export const WATCHDOG_QUEUE_NAME = 'watchdog';

export const WATCHDOG_JOB_NAME = 'scan-watchdog';

/** Stable scheduler id so boot re-registration replaces (not duplicates) the tick. */
export const WATCHDOG_SCHEDULER_ID = 'watchdog-scan';

export interface IWatchdogJob {
  tick: true;
}
