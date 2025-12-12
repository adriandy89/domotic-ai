export const DeviceOrderBy = {
  id: 'id',
  unique_id: 'unique_id',
  name: 'name',
  model: 'model',
  category: 'category',
  description: 'contact',
  icon: 'icon',
  disabled: 'disabled',
  created_at: 'created_at',
  updated_at: 'updated_at',
  organization_id: 'organization_id',
  home_id: 'home_id',
  home: 'home',
};

export type DeviceOrderBy = (typeof DeviceOrderBy)[keyof typeof DeviceOrderBy];
