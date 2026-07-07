/**
 * Pure "power-monitoring appliance state" machine — the shared core of the
 * appliance-monitor feature. Framework-agnostic (no Nest/Prisma/MQTT), so it is
 * vendored to the edge alongside the rest of rules-evaluator and reused verbatim
 * by the central host.
 *
 * It turns a stream of power samples from a metered smart plug into a discrete
 * appliance phase (idle → running → finished) using a threshold + hysteresis
 * band and sustain-over-time (debounce) windows. It is **sample-driven and
 * timestamp-driven**: every decision uses each sample's own time, never
 * wall-clock, so a burst of buffered samples replayed after a reconnect (or a
 * process restart mid-cycle) reconstructs the exact same result — this is what
 * makes edge-hosting durable.
 *
 * ASSUMPTION: the source plug publishes power readings periodically (most energy
 * plugs report on an interval as well as on-change). A plug that only reports on
 * change and then goes silent while idle would not advance the finish timer;
 * that is a hardware property, documented, not a logic gap here.
 */

/** Externally-visible appliance phases (the values published as `appliance_state`). */
export type AppliancePhase = 'idle' | 'running' | 'finished';

/** Per-monitor thresholds/durations. `idleThresholdW` MUST be < `runThresholdW`. */
export interface ApplianceMonitorConfig {
  runThresholdW: number;
  idleThresholdW: number;
  minRunSeconds: number;
  minFinishSeconds: number;
}

/**
 * The full persisted machine state. Serializable — stored between restarts in
 * the edge SQLite `kv` table (or a central column). Times are ms-epoch.
 */
export interface AppliancePhaseState {
  phase: AppliancePhase;
  /** ms-epoch of the sample that set the current `phase`. */
  phaseSince: number;
  /** ms-epoch when the current running cycle began (null outside a cycle). */
  cycleStartedAt: number | null;
  cycleEnergyWh: number;
  peakPowerW: number;
  /** Last processed sample's power / time — for energy integration + ordering. */
  lastPowerW: number | null;
  lastSampleAt: number | null;
  /**
   * ms-epoch of the first sample that started qualifying for the opposite phase
   * (a pending run- or finish-timer). null when no candidate is pending. A
   * disqualifying sample resets it — this is the debounce/hysteresis.
   */
  pendingSince: number | null;
}

export interface ApplianceSample {
  powerW: number;
  /** Sample time (ms-epoch): payload last_seen/ts when present, else event ts. */
  sampleAtMs: number;
}

/** Emitted only on a phase change; the summary fields are set on running→finished. */
export interface ApplianceTransition {
  phase: AppliancePhase;
  cycleSeconds?: number;
  cycleEnergyWh?: number;
  peakPowerW?: number;
}

export interface ApplianceStepResult {
  state: AppliancePhaseState;
  transition: ApplianceTransition | null;
}

/** Cap per-sample integration so a long silence gap can't inflate cycle energy. */
const MAX_INTEGRATION_GAP_MS = 300_000;

export function initApplianceState(sampleAtMs: number): AppliancePhaseState {
  return {
    phase: 'idle',
    phaseSince: sampleAtMs,
    cycleStartedAt: null,
    cycleEnergyWh: 0,
    peakPowerW: 0,
    lastPowerW: null,
    lastSampleAt: null,
    pendingSince: null,
  };
}

/**
 * Advance the machine by one sample. Pure: returns the next state and, when the
 * phase changed, the transition to publish. Out-of-order/duplicate samples
 * (sampleAtMs <= lastSampleAt) are ignored (state returned unchanged).
 */
export function stepApplianceState(
  prev: AppliancePhaseState,
  sample: ApplianceSample,
  cfg: ApplianceMonitorConfig,
): ApplianceStepResult {
  const { powerW, sampleAtMs } = sample;

  if (prev.lastSampleAt !== null && sampleAtMs <= prev.lastSampleAt) {
    return { state: prev, transition: null };
  }

  const dtMs =
    prev.lastSampleAt === null
      ? 0
      : Math.min(sampleAtMs - prev.lastSampleAt, MAX_INTEGRATION_GAP_MS);

  const state: AppliancePhaseState = { ...prev };
  let transition: ApplianceTransition | null = null;

  // Integrate energy + track peak while running, using the power held over the
  // just-elapsed interval (prev.lastPowerW).
  if (state.phase === 'running') {
    if (prev.lastPowerW !== null && dtMs > 0) {
      state.cycleEnergyWh += (prev.lastPowerW * dtMs) / 3_600_000;
    }
    if (powerW > state.peakPowerW) state.peakPowerW = powerW;
  }

  if (state.phase === 'idle' || state.phase === 'finished') {
    // Waiting to start: power sustained ≥ run threshold for minRunSeconds.
    if (powerW >= cfg.runThresholdW) {
      if (state.pendingSince === null) state.pendingSince = sampleAtMs;
      if (sampleAtMs - state.pendingSince >= cfg.minRunSeconds * 1000) {
        state.phase = 'running';
        state.phaseSince = sampleAtMs;
        state.cycleStartedAt = sampleAtMs;
        state.cycleEnergyWh = 0;
        state.peakPowerW = powerW;
        state.pendingSince = null;
        transition = { phase: 'running' };
      }
    } else {
      state.pendingSince = null; // dropped below run threshold → reset run timer
    }
  } else {
    // running: power sustained ≤ idle threshold for minFinishSeconds → finished.
    if (powerW <= cfg.idleThresholdW) {
      if (state.pendingSince === null) state.pendingSince = sampleAtMs;
      if (sampleAtMs - state.pendingSince >= cfg.minFinishSeconds * 1000) {
        const startedAt = state.cycleStartedAt ?? state.phaseSince;
        const cycleSeconds = Math.round((sampleAtMs - startedAt) / 1000);
        transition = {
          phase: 'finished',
          cycleSeconds,
          cycleEnergyWh: round2(state.cycleEnergyWh),
          peakPowerW: round2(state.peakPowerW),
        };
        state.phase = 'finished';
        state.phaseSince = sampleAtMs;
        state.cycleStartedAt = null;
        state.pendingSince = null;
      }
    } else {
      state.pendingSince = null; // rose above idle (mid-cycle pause) → reset finish timer
    }
  }

  state.lastPowerW = powerW;
  state.lastSampleAt = sampleAtMs;
  return { state, transition };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
