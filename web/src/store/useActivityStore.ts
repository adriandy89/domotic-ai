import { create } from 'zustand';

export interface SSEEvent {
    id: number;
    timestamp: Date;
    topic: string;
    payload: string;
}

interface ActivityState {
    events: SSEEvent[];
    addEvent: (topic: string, payload: unknown) => void;
    clearEvents: () => void;
}

const MAX_EVENTS = 100;
let eventIdCounter = 0;

export const useActivityStore = create<ActivityState>((set) => ({
    events: [],
    addEvent: (topic, payload) =>
        set((state) => {
            const newEvent: SSEEvent = {
                id: ++eventIdCounter,
                timestamp: new Date(),
                topic,
                payload: JSON.stringify(payload, null, 2),
            };
            const updated = [newEvent, ...state.events];
            return { events: updated.slice(0, MAX_EVENTS) };
        }),
    clearEvents: () => set({ events: [] }),
}));
