import { Operation, ResultType, Rule, RuleType } from "generated/prisma/client";

export interface IRuleObj {
  [key: string]: Rule;
}

export interface ICreateCondition {
  id?: number;
  device_id: number;
  attribute: string;
  operation: Operation;
  data: { value: any };
}

export interface ICreateResult {
  id?: number;
  device_id: number;
  event: string;
  type: ResultType;
  attribute: string;
  data: { value: any };
  channel: any[];
  resend_after: number;
}

export interface ICreateRule {
  id?: number;
  name: string;
  description: string;
  active: boolean;
  all: boolean;
  interval: number;
  type: RuleType;
  conditions: ICreateCondition[];
  results: ICreateResult[];
  home_id: number;
}
