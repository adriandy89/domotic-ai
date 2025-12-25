import { create } from 'zustand';
import { api } from '../lib/api';

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
}

export const useAuthStore = create<AuthState>((set) => ({
    user: null,
    isAuthenticated: false,
    isLoading: true, // Start in loading state to check session on mount

    checkSession: async () => {
        set({ isLoading: true });
        try {
            const response = await api.get('/auth/me');
            set({ user: response.data.user, isAuthenticated: true, isLoading: false });
        } catch (error) {
            // 401 or network error means not authenticated
            console.log("Not authenticated", error);
            set({ user: null, isAuthenticated: false, isLoading: false });
        }
    },

    logout: async () => {
        try {
            await api.get('/auth/logout');
        } catch (error) {
            console.error('Logout failed', error);
        } finally {
            set({ user: null, isAuthenticated: false });
            // Force reload to clear any client-side state
            window.location.href = '/';
        }
    },
}));
