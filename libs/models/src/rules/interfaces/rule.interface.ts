import { Operation, ResultType, Rule, RuleType } from "generated/prisma/client";

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
}
