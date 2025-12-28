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

export interface IDeviceHomeTable {
  id: number;
  uniqueId: string;
  name: string;
  category: string | null;
  description: string | null;
  icon: string | null;
  model: string | null;
  disabled: boolean;
  homeId: number | null;
  home: {
    uniqueId: string;
    name: string;
  } | null;
  createdAt: string;
  updatedAt: string | null;
}
