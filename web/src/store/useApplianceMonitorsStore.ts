import { create } from 'zustand';
import { api } from '../lib/api';
import { shouldFetch, trackInflight } from '../lib/staleness';

export interface ApplianceMonitor {
  id: string;
  name: string;
  source_device_id: string;
  source_device_unique_id: string;
  power_field: string;
  appliance_unique_id: string;
  appliance_type: string;
  run_threshold_w: string | number;
  idle_threshold_w: string | number;
  min_run_seconds: number;
  min_finish_seconds: number;
  active: boolean;
  home_id: string;
  home_unique_id: string;
  created_at?: string;
  updated_at?: string;
  source_device?: { id: string; name: string; unique_id: string };
}

export interface CreateApplianceMonitorRequest {
  name: string;
  home_id: string;
  source_device_id: string;
  appliance_type?: string;
  power_field?: string;
  run_threshold_w?: number;
  idle_threshold_w?: number;
  min_run_seconds?: number;
  min_finish_seconds?: number;
  active?: boolean;
}

interface ApplianceMonitorsState {
  monitors: ApplianceMonitor[];
  isLoading: boolean;
  error: string | null;

  fetchMonitors: (force?: boolean) => Promise<void>;
  createMonitor: (data: CreateApplianceMonitorRequest) => Promise<boolean>;
  updateMonitor: (
    id: string,
    data: Partial<CreateApplianceMonitorRequest>,
  ) => Promise<boolean>;
  toggleMonitor: (id: string, active: boolean) => Promise<void>;
  deleteMonitor: (id: string) => Promise<void>;
  getMonitorsByHomeId: (homeId: string | null) => ApplianceMonitor[];
}

export const useApplianceMonitorsStore = create<ApplianceMonitorsState>(
  (set, get) => ({
    monitors: [],
    isLoading: false,
    error: null,

    fetchMonitors: async (force = false) => {
      if (!shouldFetch('appliance-monitors', 60_000, force)) return;
      if (get().monitors.length === 0) set({ isLoading: true, error: null });
      const p = (async () => {
        try {
          const res = await api.get<ApplianceMonitor[]>('/appliance-monitors');
          set({ monitors: res.data || [], isLoading: false, error: null });
        } catch (error: any) {
          console.error('Failed to fetch appliance monitors', error);
          set({ error: 'Failed to fetch appliance monitors', isLoading: false });
        }
      })();
      await trackInflight('appliance-monitors', p);
    },

    createMonitor: async (data) => {
      set({ isLoading: true, error: null });
      try {
        await api.post('/appliance-monitors', data);
        set({ isLoading: false });
        get().fetchMonitors(true);
        return true;
      } catch (error: any) {
        console.error('Failed to create appliance monitor', error);
        set({
          error:
            error?.response?.data?.message ??
            'Failed to create appliance monitor',
          isLoading: false,
        });
        return false;
      }
    },

    updateMonitor: async (id, data) => {
      set({ isLoading: true, error: null });
      try {
        await api.put(`/appliance-monitors/${id}`, data);
        set({ isLoading: false });
        get().fetchMonitors(true);
        return true;
      } catch (error: any) {
        console.error('Failed to update appliance monitor', error);
        set({
          error:
            error?.response?.data?.message ??
            'Failed to update appliance monitor',
          isLoading: false,
        });
        return false;
      }
    },

    toggleMonitor: async (id, active) => {
      set((state) => ({
        monitors: state.monitors.map((m) =>
          m.id === id ? { ...m, active } : m,
        ),
      }));
      try {
        await api.put(`/appliance-monitors/toggle/${id}`, { active });
      } catch (error: any) {
        console.error('Failed to toggle appliance monitor', error);
        set((state) => ({
          monitors: state.monitors.map((m) =>
            m.id === id ? { ...m, active: !active } : m,
          ),
          error: 'Failed to toggle appliance monitor',
        }));
      }
    },

    deleteMonitor: async (id) => {
      const previous = get().monitors;
      set((state) => ({ monitors: state.monitors.filter((m) => m.id !== id) }));
      try {
        await api.delete(`/appliance-monitors/${id}`);
      } catch (error: any) {
        console.error('Failed to delete appliance monitor', error);
        set({ monitors: previous, error: 'Failed to delete appliance monitor' });
      }
    },

    getMonitorsByHomeId: (homeId) => {
      const { monitors } = get();
      if (!homeId) return monitors;
      return monitors.filter((m) => m.home_id === homeId);
    },
  }),
);
