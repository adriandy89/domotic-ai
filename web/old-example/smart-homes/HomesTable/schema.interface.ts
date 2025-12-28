export interface ITableParams {
  pageIndex?: number;
  pageSize?: number;
  filter?: string;
  sorting?: Sorting[];
}

export interface Sorting {
  id: string;
  desc: boolean;
}

export interface IHomeTable {
  id: number;
  name: string;
  uniqueId: string;
  description: string | null;
  icon: string | null;
  attributes: Attributes | null;
  disabled: boolean;
  createdAt: string;
  updatedAt: string | null;
  lastUpdate: string | null;
  mqttPassword: string | null;
  mqttUsername: string | null;
}

export interface Attributes {
  [key: string]: string;
}
