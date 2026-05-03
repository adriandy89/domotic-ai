export const ScheduleOrderBy = {
  id: 'id',
  name: 'name',
  active: 'active',
  date: 'date',
  frequency: 'frequency',
  user_id: 'user_id',
  home_id: 'home_id',
  created_at: 'created_at',
  updated_at: 'updated_at',
};

export type ScheduleOrderBy = (typeof ScheduleOrderBy)[keyof typeof ScheduleOrderBy];
