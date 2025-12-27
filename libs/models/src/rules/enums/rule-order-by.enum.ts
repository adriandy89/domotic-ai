export const RuleOrderBy = {
  id: 'id',
  name: 'name',
  description: 'description',
  active: 'active',
  all: 'all',
  interval: 'interval',
  timestamp: 'timestamp',
  type: 'type',
  user_id: 'user_id',
  organization_id: 'organization_id',
  created_at: 'created_at',
  updated_at: 'updated_at',
  home_id: 'home_id',
};

export type RuleOrderBy = (typeof RuleOrderBy)[keyof typeof RuleOrderBy];
