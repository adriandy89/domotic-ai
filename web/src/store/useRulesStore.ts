import { create } from 'zustand';
import { api } from '../lib/api';

// Enums matching Prisma schema
export type RuleType = 'RECURRENT' | 'ONETIME';
export type Operation = 'EQ' | 'NEQ' | 'GT' | 'LT' | 'GTE' | 'LTE' | 'CONTAINS';
export type ResultType = 'COMMAND' | 'NOTIFICATION';
export type NotificationChannel = 'EMAIL' | 'SMS' | 'PUSH' | 'WHATSAPP';

// Condition type
export interface Condition {
    id: string;
    device_id: string;
    device?: {
        id: string;
        name: string;
        unique_id: string;
    };
    operation: Operation;
    attribute: string;
    data: Record<string, unknown>;
}

// Result type
export interface Result {
    id: string;
    device_id?: string;
    device?: {
        id: string;
        name: string;
        unique_id: string;
    };
    event: string;
    type: ResultType;
    attribute?: string;
    data?: Record<string, unknown>;
    channel: NotificationChannel[];
    resend_after?: number;
}

// Rule type - matches API response from /rules/all/user
export interface Rule {
    id: string;
    name: string;
    description?: string;
    type: RuleType;
    active: boolean;
    all: boolean;
    interval: number;
    timestamp?: string;
    home_id: string;
    updated_at?: string;
    _count: {
        conditions: number;
        results: number;
    };
}

interface PaginatedResponse {
    data: Rule[];
    meta: {
        page: number;
        take: number;
        itemCount: number;
        pageCount: number;
        hasPreviousPage: boolean;
        hasNextPage: boolean;
    };
}

interface RulesState {
    rules: Rule[];
    isLoading: boolean;
    error: string | null;

    // Actions
    fetchRules: () => Promise<void>;
    toggleRule: (id: string, active: boolean) => Promise<void>;
    deleteRule: (id: string) => Promise<void>;
    getRulesByHomeId: (homeId: string | null) => Rule[];
}

export const useRulesStore = create<RulesState>((set, get) => ({
    rules: [],
    isLoading: false,
    error: null,

    fetchRules: async () => {
        set({ isLoading: true, error: null });
        try {
            // Use /rules/all/user which returns array of rules for current user
            const response = await api.get<Rule[]>('/rules/all/user');
            set({ rules: response.data || [], isLoading: false });
        } catch (error) {
            console.error('Failed to fetch rules', error);
            set({ error: 'Failed to fetch rules', isLoading: false });
        }
    },

    toggleRule: async (id: string, active: boolean) => {
        // Optimistic update
        set((state) => ({
            rules: state.rules.map((rule) =>
                rule.id === id ? { ...rule, active } : rule
            ),
        }));

        try {
            await api.put(`/rules/toggle/${id}`, { active });
        } catch (error) {
            console.error('Failed to toggle rule', error);
            // Revert on error
            set((state) => ({
                rules: state.rules.map((rule) =>
                    rule.id === id ? { ...rule, active: !active } : rule
                ),
                error: 'Failed to toggle rule',
            }));
        }
    },

    deleteRule: async (id: string) => {
        const previousRules = get().rules;

        // Optimistic update
        set((state) => ({
            rules: state.rules.filter((rule) => rule.id !== id),
        }));

        try {
            await api.delete(`/rules/${id}`);
        } catch (error) {
            console.error('Failed to delete rule', error);
            // Revert on error
            set({ rules: previousRules, error: 'Failed to delete rule' });
        }
    },

    getRulesByHomeId: (homeId: string | null) => {
        const { rules } = get();
        if (!homeId) return rules;
        return rules.filter((rule) => rule.home_id === homeId);
    },
}));
