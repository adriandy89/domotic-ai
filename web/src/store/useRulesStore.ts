import { create } from 'zustand';
import { api } from '../lib/api';

// Enums matching Prisma schema
export type RuleType = 'RECURRENT' | 'ONETIME';
export type Operation = 'EQ' | 'NEQ' | 'GT' | 'LT' | 'GTE' | 'LTE' | 'CONTAINS';
export type ResultType = 'COMMAND' | 'NOTIFICATION';
export type NotificationChannel = 'EMAIL' | 'SMS' | 'PUSH' | 'TELEGRAM' | 'WEBHOOK';

// Condition type for API responses
export interface Condition {
    id?: string;
    device_id: string;
    operation: Operation;
    attribute: string;
    data: Record<string, unknown>;
}

// Result type for API responses
export interface Result {
    id?: string;
    device_id?: string;
    event: string;
    type: ResultType;
    attribute?: string;
    data?: Record<string, unknown>;
    channel: NotificationChannel[];
    resend_after?: number;
}

// Rule list item (from /rules/all/user)
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

// Full rule detail (from /rules/:id)
export interface RuleDetail {
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
    conditions: Condition[];
    results: Result[];
}

// Create/Update rule request
export interface CreateRuleRequest {
    name: string;
    description?: string;
    type: RuleType;
    active: boolean;
    all: boolean;
    interval: number;
    home_id: string;
    conditions: Omit<Condition, 'id'>[];
    results: Omit<Result, 'id'>[];
}

interface RulesState {
    rules: Rule[];
    currentRule: RuleDetail | null;
    isLoading: boolean;
    error: string | null;

    // Actions
    fetchRules: () => Promise<void>;
    getRuleById: (id: string) => Promise<RuleDetail | null>;
    createRule: (data: CreateRuleRequest) => Promise<boolean>;
    updateRule: (id: string, data: CreateRuleRequest) => Promise<boolean>;
    toggleRule: (id: string, active: boolean) => Promise<void>;
    deleteRule: (id: string) => Promise<void>;
    getRulesByHomeId: (homeId: string | null) => Rule[];
    clearCurrentRule: () => void;
}

export const useRulesStore = create<RulesState>((set, get) => ({
    rules: [],
    currentRule: null,
    isLoading: false,
    error: null,

    fetchRules: async () => {
        set({ isLoading: true, error: null });
        try {
            const response = await api.get<Rule[]>('/rules/all/user');
            set({ rules: response.data || [], isLoading: false });
        } catch (error) {
            console.error('Failed to fetch rules', error);
            set({ error: 'Failed to fetch rules', isLoading: false });
        }
    },

    getRuleById: async (id: string) => {
        set({ isLoading: true, error: null });
        try {
            const response = await api.get<RuleDetail>(`/rules/${id}`);
            set({ currentRule: response.data, isLoading: false });
            return response.data;
        } catch (error) {
            console.error('Failed to fetch rule', error);
            set({ error: 'Failed to fetch rule', isLoading: false, currentRule: null });
            return null;
        }
    },

    createRule: async (data: CreateRuleRequest) => {
        set({ isLoading: true, error: null });
        try {
            await api.post('/rules', data);
            set({ isLoading: false });
            // Refresh rules list
            get().fetchRules();
            return true;
        } catch (error) {
            console.error('Failed to create rule', error);
            set({ error: 'Failed to create rule', isLoading: false });
            return false;
        }
    },

    updateRule: async (id: string, data: CreateRuleRequest) => {
        set({ isLoading: true, error: null });
        try {
            await api.put(`/rules/${id}`, data);
            set({ isLoading: false });
            // Refresh rules list
            get().fetchRules();
            return true;
        } catch (error) {
            console.error('Failed to update rule', error);
            set({ error: 'Failed to update rule', isLoading: false });
            return false;
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
        set((state) => ({
            rules: state.rules.filter((rule) => rule.id !== id),
        }));

        try {
            await api.delete(`/rules/${id}`);
        } catch (error) {
            console.error('Failed to delete rule', error);
            set({ rules: previousRules, error: 'Failed to delete rule' });
        }
    },

    getRulesByHomeId: (homeId: string | null) => {
        const { rules } = get();
        if (!homeId) return rules;
        return rules.filter((rule) => rule.home_id === homeId);
    },

    clearCurrentRule: () => {
        set({ currentRule: null });
    },
}));
