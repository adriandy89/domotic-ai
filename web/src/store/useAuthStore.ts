import { create } from 'zustand';
import { api } from '../lib/api';
import { useHomesStore } from './useHomesStore';
import { sseService } from '../lib/sse';

export interface User {
    id: string;
    email: string;
    name: string;
    is_org_admin: boolean;
    organization_id: string;
    is_active: boolean;
    role: string;
    phone: string | null;
    attributes: any | null;
    telegram_chat_id: string | null;
    channels: string[];
    notification_batch_minutes: number;
    created_at: string;
    updated_at: string;
}

interface AuthState {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    checkSession: () => Promise<void>;
    logout: () => Promise<void>;
    updateUser: (user: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
    user: null,
    isAuthenticated: false,
    isLoading: true, // Start in loading state to check session on mount

    updateUser: (updates) => {
        set((state) => ({
            user: state.user ? { ...state.user, ...updates } : null,
        }));
    },

    checkSession: async () => {
        set({ isLoading: true });
        try {
            const response = await api.get('/auth/me');
            set({ user: response.data.user, isAuthenticated: true, isLoading: false });

            // Fetch homes after successful authentication
            useHomesStore.getState().fetchHomes();

            // Connect to SSE for real-time updates
            sseService.resetReconnection();
            sseService.connect();
        } catch (error) {
            // 401 or network error means not authenticated
            console.log("Not authenticated", error);
            set({ user: null, isAuthenticated: false, isLoading: false });

            // Clear homes data on auth failure
            useHomesStore.getState().clearHomes();

            // Disconnect SSE
            sseService.disconnect();
        }
    },

    logout: async () => {
        // Disconnect SSE first
        sseService.disconnect();

        try {
            await api.get('/auth/logout');
        } catch (error) {
            console.error('Logout failed', error);
        } finally {
            set({ user: null, isAuthenticated: false });
            // Clear homes data on logout
            useHomesStore.getState().clearHomes();
            // Force reload to clear any client-side state
            window.location.href = '/';
        }
    },
}));
