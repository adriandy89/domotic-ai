import { Inject, Injectable, Logger } from '@nestjs/common';
import type { MqttClient } from 'mqtt';
import {
  AppliancePhaseState,
  initApplianceState,
  stepApplianceState,
} from '@app/rules-evaluator';
import { MonitorConfig } from './config-store.service';

/**
 * Runs the pure appliance state machine centrally and republishes transitions to
 * central TBMQ. Phase is held IN MEMORY only (no per-restart persistence) — the
 * central host targets always-connected non-edge homes, where a cycle spanning a
 * process restart is an accepted minor gap; edge homes get SQLite-backed phase.
 */
@Injectable()
export class StateMachineService {
  private readonly logger = new Logger(StateMachineService.name);
  private readonly phases = new Map<string, AppliancePhaseState>();

  constructor(@Inject('MQTT_CLIENT') private readonly mqtt: MqttClient) {}

  onSample(mon: MonitorConfig, powerW: number, sampleAtMs: number): void {
    const existing = this.phases.get(mon.id);
    const firstSample = existing === undefined;
    const prev = existing ?? initApplianceState(sampleAtMs);

    const { state, transition } = stepApplianceState(
      prev,
      { powerW, sampleAtMs },
      {
        runThresholdW: mon.runThresholdW,
        idleThresholdW: mon.idleThresholdW,
        minRunSeconds: mon.minRunSeconds,
        minFinishSeconds: mon.minFinishSeconds,
      },
    );
    this.phases.set(mon.id, state);

    if (transition) {
      this.publish(mon, transition.phase, powerW, {
        cycle_energy_wh: transition.cycleEnergyWh,
        cycle_seconds: transition.cycleSeconds,
        peak_power_w: transition.peakPowerW,
      });
      this.logger.log(`${mon.applianceUniqueId}: → ${transition.phase}`);
    } else if (firstSample) {
      this.publish(mon, state.phase, powerW);
    }
  }

  private publish(
    mon: MonitorConfig,
    phase: string,
    powerW: number,
    extra: Record<string, number | undefined> = {},
  ): void {
    const payload: Record<string, unknown> = {
      appliance_state: phase,
      power: Math.round(powerW * 100) / 100,
    };
    for (const [k, v] of Object.entries(extra)) {
      if (v !== undefined) payload[k] = v;
    }
    const topic = `home/id/${mon.homeUniqueId}/wifi/${mon.applianceUniqueId}/state`;
    this.mqtt.publish(topic, JSON.stringify(payload), { qos: 1, retain: true });
  }
}
