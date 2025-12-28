import { RoleHome } from "./role-home.enum";

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

export interface IUserHomeTable {
  id: number;
  username: string;
  phone?: string | null;
  name: string;
  attributes?: Attributes | null;
  isActive: boolean;
  organizationId: number;
  updatedAt: string;
  createdAt: string;
  role: RoleHome;
  expirationTime?: string;
  channels?: string[];
}

export interface Attributes {
  [key: string]: string;
}
