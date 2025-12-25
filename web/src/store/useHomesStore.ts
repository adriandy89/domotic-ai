import { create } from 'zustand';
import { api } from '../lib/api';
import { useDevicesStore } from './useDevicesStore';
import type { Device } from './useDevicesStore';

// Home without devices array (devices are stored separately)
export interface Home {
    id: string;
    unique_id: string;
    name: string;
    description: string;
    attributes: Record<string, unknown>;
    disabled: boolean;
    created_at: string;
    updated_at: string;
    last_update: string;
    icon: string;
    image: string | null;
    connected: boolean;
}

// API response includes devices
interface HomeWithDevices extends Home {
    devices: Device[];
}

interface HomesState {
    homes: Record<string, Home>; // Indexed by home id for O(1) access
    homeIds: string[]; // Ordered list of home ids
    isLoading: boolean;
    error: string | null;
    selectedHomeId: string | null;

    // Actions
    fetchHomes: () => Promise<void>;
    updateHome: (homeId: string, updates: Partial<Home>) => void;
    setSelectedHome: (homeId: string | null) => void;
    getSelectedHome: () => Home | undefined;
    getHomeById: (homeId: string) => Home | undefined;
    clearHomes: () => void;
}

export const useHomesStore = create<HomesState>((set, get) => ({
    homes: {},
    homeIds: [],
    isLoading: false,
    error: null,
    selectedHomeId: null,

    fetchHomes: async () => {
        set({ isLoading: true, error: null });
        try {
            const response = await api.get<HomeWithDevices[]>('/homes/me');
            const homesWithDevices = response.data;

            // Separate homes and devices
            const homesMap: Record<string, Home> = {};
            const homeIds: string[] = [];
            const allDevices: Device[] = [];

            homesWithDevices.forEach(homeWithDevices => {
                const { devices, ...home } = homeWithDevices;
                homesMap[home.id] = home;
                homeIds.push(home.id);
                allDevices.push(...devices);
            });

            // Set devices in the devices store
            useDevicesStore.getState().setDevices(allDevices);

            // Fetch last data for all devices
            useDevicesStore.getState().fetchDevicesData();

            set({
                homes: homesMap,
                homeIds,
                isLoading: false,
                // Auto-select first home if none selected
                selectedHomeId: get().selectedHomeId || (homeIds.length > 0 ? homeIds[0] : null)
            });
        } catch (error) {
            console.error('Failed to fetch homes', error);
            set({ homes: {}, homeIds: [], isLoading: false, error: 'Failed to fetch homes' });
        }
    },

    updateHome: (homeId: string, updates: Partial<Home>) => {
        const { homes } = get();
        const home = homes[homeId];

        if (home) {
            set({
                homes: {
                    ...homes,
                    [homeId]: { ...home, ...updates }
                }
            });
        }
    },

    setSelectedHome: (homeId: string | null) => {
        set({ selectedHomeId: homeId });
    },

    getSelectedHome: () => {
        const { homes, selectedHomeId } = get();
        return selectedHomeId ? homes[selectedHomeId] : undefined;
    },

    getHomeById: (homeId: string) => {
        return get().homes[homeId];
    },

    clearHomes: () => {
        set({ homes: {}, homeIds: [], selectedHomeId: null, error: null });
        // Also clear devices
        useDevicesStore.getState().clearDevices();
    },
}));

