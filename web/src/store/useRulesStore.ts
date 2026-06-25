import { create } from 'zustand';
import { api } from '../lib/api';
import { shouldFetch, trackInflight } from '../lib/staleness';

// Enums matching Prisma schema
// Matches the Prisma `RuleType` values the UI supports. (The backend enum also
// has SPECIFIC, which the rules engine does not execute, so it's not offered.)
export type RuleType = 'RECURRENT' | 'ONCE';
export type Operation =
  | 'EQ'
  | 'NEQ'
  | 'GT'
  | 'LT'
  | 'GTE'
  | 'LTE'
  | 'CONTAINS'
  // Absence/silence operators evaluated by the backend watchdog (care rules):
  // INACTIVE = attribute not active for data.forSeconds; STALE = device hasn't
  // reported for data.forSeconds.
  | 'INACTIVE'
  | 'STALE';
export type ResultType = 'COMMAND' | 'NOTIFICATION';
export type NotificationChannel =
  | 'EMAIL'
  | 'SMS'
  | 'PUSH'
  | 'TELEGRAM'
  | 'WEBHOOK';
export type WeekDay =
  | 'SUNDAY'
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY';

/**
 * Optional "when to execute" window. When window_active, the rule may only act
 * within the given weekdays (empty = every day) and time-of-day range
 * (minute-of-day; start > end wraps midnight), evaluated in the home timezone.
 */
export interface ExecutionWindowFields {
  window_active?: boolean;
  window_days?: WeekDay[];
  window_all_day?: boolean;
  window_start?: number | null;
  window_end?: number | null;
}

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
  /** External email recipients for care alerts (sent regardless of owner channels). */
  recipients?: string[];
}

// Rule list item (from /rules/all/user)
export interface Rule extends ExecutionWindowFields {
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
  /** Operations of this rule's conditions (used to flag care/absence rules). */
  conditions?: { operation: Operation }[];
  /** Result `data` (used to flag care rules that notify external recipients). */
  results?: { data?: Record<string, unknown> | null }[];
}

// Full rule detail (from /rules/:id)
export interface RuleDetail extends ExecutionWindowFields {
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
export interface CreateRuleRequest extends ExecutionWindowFields {
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
  fetchRules: (force?: boolean) => Promise<void>;
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

  fetchRules: async (force = false) => {
    // Skip if fresh or already in flight; keep showing current data while
    // revalidating (spinner only on the very first load).
    if (!shouldFetch('rules', 60_000, force)) return;
    if (get().rules.length === 0) set({ isLoading: true, error: null });
    const p = (async () => {
      try {
        const response = await api.get<Rule[]>('/rules/all/user');
        set({ rules: response.data || [], isLoading: false, error: null });
      } catch (error: any) {
        console.error('Failed to fetch rules', error);
        set({ error: 'Failed to fetch rules', isLoading: false });
      }
    })();
    await trackInflight('rules', p);
  },

  getRuleById: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get<RuleDetail>(`/rules/${id}`);
      set({ currentRule: response.data, isLoading: false });
      return response.data;
    } catch (error: any) {
      console.error('Failed to fetch rule', error);
      set({
        error: 'Failed to fetch rule',
        isLoading: false,
        currentRule: null,
      });
      return null;
    }
  },

  createRule: async (data: CreateRuleRequest) => {
    set({ isLoading: true, error: null });
    try {
      await api.post('/rules', data);
      set({ isLoading: false });
      // Refresh rules list
      get().fetchRules(true);
      return true;
    } catch (error: any) {
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
      get().fetchRules(true);
      return true;
    } catch (error: any) {
      console.error('Failed to update rule', error);
      set({ error: 'Failed to update rule', isLoading: false });
      return false;
    }
  },

  toggleRule: async (id: string, active: boolean) => {
    // Optimistic update
    set((state) => ({
      rules: state.rules.map((rule) =>
        rule.id === id ? { ...rule, active } : rule,
      ),
    }));

    try {
      await api.put(`/rules/toggle/${id}`, { active });
    } catch (error: any) {
      console.error('Failed to toggle rule', error);
      set((state) => ({
        rules: state.rules.map((rule) =>
          rule.id === id ? { ...rule, active: !active } : rule,
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
    } catch (error: any) {
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
