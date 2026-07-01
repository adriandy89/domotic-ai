import { create } from 'zustand';
import { api } from '../lib/api';
import { shouldFetch, trackInflight } from '../lib/staleness';

export type ScheduleFrequency = 'ONCE' | 'DAILY' | 'CUSTOM';
export type ScheduleDay =
  | 'SUNDAY'
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY';
export type NotificationChannel =
  | 'EMAIL'
  | 'SMS'
  | 'PUSH'
  | 'TELEGRAM'
  | 'WEBHOOK';

export interface ScheduleAction {
  id?: string;
  device_id?: string | null;
  attribute: string;
  data: Record<string, unknown>;
}

export interface Schedule {
  id: string;
  name: string;
  active: boolean;
  /** Run locally on edge-enabled homes when offline. */
  run_offline?: boolean;
  date?: string | null;
  frequency: ScheduleFrequency;
  days: ScheduleDay[];
  channel: NotificationChannel[];
  home_id: string;
  user_id: string;
  created_at?: string;
  updated_at?: string;
  _count: {
    actions: number;
  };
}

export interface ScheduleDetail {
  id: string;
  name: string;
  active: boolean;
  /** Run locally on edge-enabled homes when offline. */
  run_offline?: boolean;
  date?: string | null;
  frequency: ScheduleFrequency;
  days: ScheduleDay[];
  channel: NotificationChannel[];
  home_id: string;
  user_id: string;
  created_at?: string;
  updated_at?: string;
  actions: ScheduleAction[];
}

export interface CreateScheduleRequest {
  name: string;
  active: boolean;
  /** Run locally on edge-enabled homes when offline. */
  run_offline?: boolean;
  date?: string | null;
  frequency: ScheduleFrequency;
  days: ScheduleDay[];
  channel: NotificationChannel[];
  home_id: string;
  actions: Omit<ScheduleAction, 'id'>[];
}

interface SchedulesState {
  schedules: Schedule[];
  currentSchedule: ScheduleDetail | null;
  isLoading: boolean;
  error: string | null;

  fetchSchedules: (force?: boolean) => Promise<void>;
  getScheduleById: (id: string) => Promise<ScheduleDetail | null>;
  createSchedule: (data: CreateScheduleRequest) => Promise<boolean>;
  updateSchedule: (id: string, data: CreateScheduleRequest) => Promise<boolean>;
  toggleSchedule: (id: string, active: boolean) => Promise<void>;
  deleteSchedule: (id: string) => Promise<void>;
  getSchedulesByHomeId: (homeId: string | null) => Schedule[];
  clearCurrentSchedule: () => void;
}

export const useSchedulesStore = create<SchedulesState>((set, get) => ({
  schedules: [],
  currentSchedule: null,
  isLoading: false,
  error: null,

  fetchSchedules: async (force = false) => {
    // Skip if fresh or in flight; keep current data while revalidating.
    if (!shouldFetch('schedules', 60_000, force)) return;
    if (get().schedules.length === 0) set({ isLoading: true, error: null });
    const p = (async () => {
      try {
        const response = await api.get<Schedule[]>('/schedules/all/user');
        set({ schedules: response.data || [], isLoading: false, error: null });
      } catch (error: any) {
        console.error('Failed to fetch schedules', error);
        set({ error: 'Failed to fetch schedules', isLoading: false });
      }
    })();
    await trackInflight('schedules', p);
  },

  getScheduleById: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get<ScheduleDetail>(`/schedules/${id}`);
      set({ currentSchedule: response.data, isLoading: false });
      return response.data;
    } catch (error: any) {
      console.error('Failed to fetch schedule', error);
      set({
        error: 'Failed to fetch schedule',
        isLoading: false,
        currentSchedule: null,
      });
      return null;
    }
  },

  createSchedule: async (data) => {
    set({ isLoading: true, error: null });
    try {
      await api.post('/schedules', data);
      set({ isLoading: false });
      get().fetchSchedules(true);
      return true;
    } catch (error: any) {
      console.error('Failed to create schedule', error);
      set({ error: 'Failed to create schedule', isLoading: false });
      return false;
    }
  },

  updateSchedule: async (id, data) => {
    set({ isLoading: true, error: null });
    try {
      await api.put(`/schedules/${id}`, data);
      set({ isLoading: false });
      get().fetchSchedules(true);
      return true;
    } catch (error: any) {
      console.error('Failed to update schedule', error);
      set({ error: 'Failed to update schedule', isLoading: false });
      return false;
    }
  },

  toggleSchedule: async (id, active) => {
    set((state) => ({
      schedules: state.schedules.map((s) =>
        s.id === id ? { ...s, active } : s,
      ),
    }));
    try {
      await api.put(`/schedules/toggle/${id}`, { active });
    } catch (error: any) {
      console.error('Failed to toggle schedule', error);
      set((state) => ({
        schedules: state.schedules.map((s) =>
          s.id === id ? { ...s, active: !active } : s,
        ),
        error: 'Failed to toggle schedule',
      }));
    }
  },

  deleteSchedule: async (id) => {
    const previous = get().schedules;
    set((state) => ({
      schedules: state.schedules.filter((s) => s.id !== id),
    }));
    try {
      await api.delete(`/schedules/${id}`);
    } catch (error: any) {
      console.error('Failed to delete schedule', error);
      set({ schedules: previous, error: 'Failed to delete schedule' });
    }
  },

  getSchedulesByHomeId: (homeId) => {
    const { schedules } = get();
    if (!homeId) return schedules;
    return schedules.filter((s) => s.home_id === homeId);
  },

  clearCurrentSchedule: () => set({ currentSchedule: null }),
}));
