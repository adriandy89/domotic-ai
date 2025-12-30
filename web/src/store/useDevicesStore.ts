import { create } from 'zustand';
import { api } from '../lib/api';

export interface DeviceExpose {
    name: string;
    type: string;
    label: string;
    access: number;
    property: string;
    unit?: string;
    category?: string;
    value_on?: boolean | string;
    value_off?: boolean | string;
    value_max?: number;
    value_min?: number;
    value_step?: number;
    values?: string[];
    description?: string;
    features?: DeviceExpose[];
}

export interface DeviceLearnedCommand {
    id: string;
    name: string;
    command: string;
    updated_at: string;
}

export interface DeviceDefinition {
    model: string;
    source: string;
    vendor: string;
    exposes: DeviceExpose[];
    options?: DeviceExpose[];
    description: string;
    supports_ota: boolean;
}

export interface DeviceAttributes {
    type: string;
    disabled: boolean;
    model_id: string;
    date_code?: string;
    endpoints: Record<string, unknown>;
    supported: boolean;
    definition: DeviceDefinition;
    ieee_address: string;
    interviewing: boolean;
    manufacturer: string;
    power_source: string;
    friendly_name: string;
    interview_state: string;
    network_address: number;
    software_build_id?: string;
    interview_completed: boolean;
}

export interface Device {
    id: string;
    unique_id: string;
    name: string;
    description: string | null;
    category: string | null;
    attributes: DeviceAttributes;
    disabled: boolean;
    created_at: string;
    updated_at: string;
    home_id: string;
    icon: string | null;
    model: string;
    show_on_map: boolean;
    x: number;
    y: number;
    learned_commands?: DeviceLearnedCommand[];
}

// Last data received from device sensors/states
export interface DeviceData {
    device_id: string;
    timestamp: string;
    data: Record<string, any>;
}

interface DeviceDataApiResponse {
    ok: boolean;
    lastData: DeviceData[];
}

interface DevicesState {
    devices: Record<string, Device>; // Indexed by device id for O(1) access
    devicesByHome: Record<string, string[]>; // home_id -> device ids
    devicesData: Record<string, DeviceData>; // device_id -> last data
    isLoading: boolean;
    isLoadingData: boolean;
    error: string | null;

    // Actions
    setDevices: (devices: Device[]) => void;
    fetchDevices: () => Promise<void>;
    fetchDevicesData: () => Promise<void>;
    updateDevice: (deviceId: string, updates: Partial<Device>) => void;
    updateDeviceAttributes: (deviceId: string, attributes: Partial<DeviceAttributes>) => void;
    updateDeviceData: (deviceId: string, data: Record<string, unknown>, timestamp?: string) => void;
    getDeviceById: (deviceId: string) => Device | undefined;
    getDeviceDataById: (deviceId: string) => DeviceData | undefined;
    getDevicesByHomeId: (homeId: string) => Device[];
    clearDevices: () => void;
}

export const useDevicesStore = create<DevicesState>((set, get) => ({
    devices: {},
    devicesByHome: {},
    devicesData: {},
    isLoading: false,
    isLoadingData: false,
    error: null,

    setDevices: (devices: Device[]) => {
        const devicesMap: Record<string, Device> = {};
        const devicesByHome: Record<string, string[]> = {};

        devices.forEach(device => {
            devicesMap[device.id] = device;

            if (!devicesByHome[device.home_id]) {
                devicesByHome[device.home_id] = [];
            }
            devicesByHome[device.home_id].push(device.id);
        });

        set({ devices: devicesMap, devicesByHome });
    },

    fetchDevicesData: async () => {
        set({ isLoadingData: true });
        try {
            const response = await api.get<DeviceDataApiResponse>('/devices/data/user');

            if (response.data.ok && response.data.lastData) {
                const devicesDataMap: Record<string, DeviceData> = {};

                response.data.lastData.forEach(deviceData => {
                    devicesDataMap[deviceData.device_id] = deviceData;
                });

                set({ devicesData: devicesDataMap, isLoadingData: false });
            } else {
                set({ isLoadingData: false });
            }
        } catch (error) {
            console.error('Failed to fetch devices data', error);
            set({ isLoadingData: false, error: 'Failed to fetch devices data' });
        }
    },

    fetchDevices: async () => {
        set({ isLoading: true });
        try {
            // We use the same endpoint as DevicesTable but without pagination to get all devices for the map state
            // Or if backend supports unpaginated list. 
            // DevicesTable uses /devices?page=...&take=...
            // If we want all devices, we might need a param or loop. 
            // For now let's assume /devices/all or just /devices with large limit?
            // Actually, usually store should hold all devices for client side filtering?
            // Let's assume user has a reasonable amount of devices or use existing logic.
            // But currently DevicesTable handles fetching. 
            // Let's try to fetch all devices.
            const response = await api.get<{ data: Device[] }>('/devices?take=1000'); // Temporary large limit
            if (response.data?.data) {
                get().setDevices(response.data.data);
            }
            set({ isLoading: false });
        } catch (error) {
            console.error('Failed to fetch devices', error);
            set({ isLoading: false, error: 'Failed to fetch devices' });
        }
    },

    updateDevice: (deviceId: string, updates: Partial<Device>) => {
        const { devices } = get();
        const device = devices[deviceId];

        if (device) {
            set({
                devices: {
                    ...devices,
                    [deviceId]: { ...device, ...updates }
                }
            });
        }
    },

    updateDeviceAttributes: (deviceId: string, attributes: Partial<DeviceAttributes>) => {
        const { devices } = get();
        const device = devices[deviceId];

        if (device) {
            set({
                devices: {
                    ...devices,
                    [deviceId]: {
                        ...device,
                        attributes: { ...device.attributes, ...attributes }
                    }
                }
            });
        }
    },

    updateDeviceData: (deviceId: string, data: Record<string, unknown>, timestamp?: string) => {
        const { devicesData } = get();
        const existingData = devicesData[deviceId];

        set({
            devicesData: {
                ...devicesData,
                [deviceId]: {
                    device_id: deviceId,
                    timestamp: timestamp || new Date().toISOString(),
                    data: existingData
                        ? { ...existingData.data, ...data } // Merge with existing data
                        : data
                }
            }
        });
    },

    getDeviceById: (deviceId: string) => {
        return get().devices[deviceId];
    },

    getDeviceDataById: (deviceId: string) => {
        return get().devicesData[deviceId];
    },

    getDevicesByHomeId: (homeId: string) => {
        const { devices, devicesByHome } = get();
        const deviceIds = devicesByHome[homeId] || [];
        return deviceIds.map(id => devices[id]).filter(Boolean);
    },

    clearDevices: () => {
        set({ devices: {}, devicesByHome: {}, devicesData: {}, error: null });
    },
}));
