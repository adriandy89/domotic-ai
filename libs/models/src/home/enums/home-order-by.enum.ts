export const HomeOrderBy = {
  id: 'id',
  unique_id: 'unique_id',
  name: 'name',
  description: 'contact',
  icon: 'icon',
  disabled: 'disabled',
  created_at: 'created_at',
  updated_at: 'updated_at',
  last_update: 'last_update',
  organization_id: 'organization_id',
};

export type HomeOrderBy = (typeof HomeOrderBy)[keyof typeof HomeOrderBy];
