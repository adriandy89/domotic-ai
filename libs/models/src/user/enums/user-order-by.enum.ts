export const UserOrderBy = {
  id: 'id',
  organization_id: 'organization_id',
  created_at: 'created_at',
  updated_at: 'updated_at',
  email: 'email',
  phone: 'phone',
  name: 'name',
  role: 'role',
  is_active: 'is_active',
  expiration_time: 'expiration_time',
};

export type UserOrderBy = (typeof UserOrderBy)[keyof typeof UserOrderBy];
