import {
  Operation,
  ResultType,
  Rule,
  RuleType,
  ScheduleDays,
} from 'generated/prisma/client';

export interface IRuleObj {
  [key: string]: Rule;
}

export interface ICreateCondition {
  id?: string;
  device_id: string;
  attribute: string;
  operation: Operation;
  data: { value: any };
}

export interface ICreateResult {
  id?: string;
  device_id: string;
  event: string;
  type: ResultType;
  attribute: string;
  data: { value: any };
  channel: any[];
  resend_after: number;
}

export interface ICreateRule {
  id?: string;
  name: string;
  description: string;
  active: boolean;
  all: boolean;
  interval: number;
  type: RuleType;
  conditions: ICreateCondition[];
  results: ICreateResult[];
  home_id: string;
  window_active?: boolean;
  window_days?: ScheduleDays[];
  window_all_day?: boolean;
  window_start?: number | null;
  window_end?: number | null;
}
