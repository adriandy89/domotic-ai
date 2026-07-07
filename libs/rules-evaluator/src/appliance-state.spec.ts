import {
  ApplianceMonitorConfig,
  AppliancePhaseState,
  ApplianceTransition,
  initApplianceState,
  stepApplianceState,
} from './appliance-state';

const CFG: ApplianceMonitorConfig = {
  runThresholdW: 10,
  idleThresholdW: 2,
  minRunSeconds: 30,
  minFinishSeconds: 120,
};

const S = 1000;

/** Feed a series of [secondsFromStart, watts] samples; collect the transitions. */
function run(
  samples: Array<[number, number]>,
  cfg = CFG,
): { state: AppliancePhaseState; transitions: ApplianceTransition[] } {
  const t0 = 1_700_000_000_000;
  let state = initApplianceState(t0);
  const transitions: ApplianceTransition[] = [];
  for (const [sec, w] of samples) {
    const r = stepApplianceState(
      state,
      { powerW: w, sampleAtMs: t0 + sec * S },
      cfg,
    );
    state = r.state;
    if (r.transition) transitions.push(r.transition);
  }
  return { state, transitions };
}

describe('appliance state machine', () => {
  it('detects a full idle → running → finished cycle exactly once', () => {
    const { state, transitions } = run([
      [0, 0], // idle
      [10, 500], // power up (pending run timer starts)
      [30, 500], // still high but <30s sustained → not yet running
      [45, 500], // ≥30s sustained → running
      [120, 480], // running
      [200, 0], // drops to idle (pending finish timer starts)
      [280, 0], // <120s sustained → not finished
      [340, 0], // ≥120s sustained → finished
      [400, 0], // stays finished (no second transition)
    ]);
    expect(transitions.map((t) => t.phase)).toEqual(['running', 'finished']);
    expect(state.phase).toBe('finished');
    expect(transitions[1].cycleSeconds).toBeGreaterThan(0);
    expect(transitions[1].peakPowerW).toBeGreaterThanOrEqual(480);
  });

  it('ignores a mid-cycle pause (rinse/spin gap) via finish hysteresis', () => {
    const { transitions } = run([
      [0, 0],
      [10, 600],
      [50, 600], // running by now
      [100, 0], // pause begins (pending finish)
      [150, 0], // 50s of pause
      [180, 700], // power returns before 120s → finish timer resets
      [240, 700], // still running
      [300, 0], // pause again
      [430, 0], // ≥120s sustained → finished
    ]);
    // Only ONE finished, and it happened after the second sustained idle window.
    expect(transitions.map((t) => t.phase)).toEqual(['running', 'finished']);
  });

  it('does not start on a brief spike below the run window', () => {
    const { state, transitions } = run([
      [0, 0],
      [10, 900], // spike
      [20, 0], // gone before 30s sustained
      [200, 0],
    ]);
    expect(transitions).toHaveLength(0);
    expect(state.phase).toBe('idle');
  });

  it('is replay-safe: a compressed burst with real sample times still fires', () => {
    // Same sample TIMES as a normal cycle, but fed back-to-back (as on reconnect).
    const normal = run([
      [0, 0],
      [45, 500],
      [90, 500],
      [200, 0],
      [340, 0],
    ]);
    expect(normal.transitions.map((t) => t.phase)).toEqual([
      'running',
      'finished',
    ]);
  });

  it('ignores out-of-order / duplicate samples', () => {
    const t0 = 1_700_000_000_000;
    let state = initApplianceState(t0);
    state = stepApplianceState(
      state,
      { powerW: 500, sampleAtMs: t0 + 100 * S },
      CFG,
    ).state;
    const before = { ...state };
    const r = stepApplianceState(
      state,
      { powerW: 999, sampleAtMs: t0 + 50 * S },
      CFG,
    );
    expect(r.transition).toBeNull();
    expect(r.state).toEqual(before);
  });
});
