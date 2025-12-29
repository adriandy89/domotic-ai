import { useState, useEffect, useCallback } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '../ui/dialog';
import { DropdownMenu, DropdownMenuItem } from '../ui/dropdown-menu';
import { LinkDialog } from './LinkDialog';
import {
  Users,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  ToggleLeft,
  ToggleRight,
  Loader2,
  RefreshCw,
  MoreHorizontal,
  Pencil,
  Trash2,
  Shield,
  Home,
  AlertCircle,
} from 'lucide-react';
import { api } from '../../lib/api';

interface UserData {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  is_active: boolean;
  is_org_admin: boolean;
  attributes: Record<string, unknown> | null;
  created_at: string;
  updated_at: string | null;
}

interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    take: number;
    itemCount: number;
    pageCount: number;
    hasPreviousPage: boolean;
    hasNextPage: boolean;
  };
}

interface UsersTableProps {
  onDataChange?: () => void;
}

export default function UsersTable({ onDataChange }: UsersTableProps) {
  const getStoredPageSize = () => {
    const stored = localStorage.getItem('usersTable_pageSize');
    if (stored) {
      const num = parseInt(stored, 10);
      if (!isNaN(num) && num >= 5 && num <= 50) return num;
    }
    return 10;
  };

  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [take, setTakeState] = useState(getStoredPageSize);

  const setTake = (value: number) => {
    const validValue = Math.max(5, Math.min(50, value));
    setTakeState(validValue);
    localStorage.setItem('usersTable_pageSize', String(validValue));
  };

  const [search, setSearch] = useState('');
  const [meta, setMeta] = useState({
    page: 1,
    take: 10,
    itemCount: 0,
    pageCount: 0,
    hasPreviousPage: false,
    hasNextPage: false,
  });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserData | null>(null);
  const [editTarget, setEditTarget] = useState<UserData | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkTarget, setLinkTarget] = useState<UserData | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    role: 'USER',
    is_active: true,
  });
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      let url = `/users?page=${page}&take=${take}`;
      if (search) url += `&search=${encodeURIComponent(search)}`;
      if (sortBy && sortOrder) {
        url += `&orderBy=${sortBy}&sortOrder=${sortOrder}`;
      }

      const response = await api.get<PaginatedResponse<UserData>>(url);
      setUsers(response.data.data);
      setMeta(response.data.meta);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setLoading(false);
    }
  }, [page, take, search, sortBy, sortOrder]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleToggleStatus = async (enable: boolean) => {
    if (selectedIds.length === 0) return;
    try {
      const url = enable ? '/users/enable/many' : '/users/disable/many';
      await api.put(url, { uuids: selectedIds });
      setSelectedIds([]);
      fetchUsers();
      onDataChange?.();
    } catch (error) {
      console.error('Failed to toggle status:', error);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/users/${deleteTarget.id}`);
      setDeleteTarget(null);
      setShowDeleteModal(false);
      setModalError(null);
      fetchUsers();
      onDataChange?.();
    } catch (error: any) {
      console.error('Failed to delete user:', error);
      setModalError(error.response?.data?.message || 'Failed to delete user');
    }
  };

  const handleAddUser = async () => {
    if (!formData.name || !formData.email || !formData.password) return;
    setSubmitting(true);
    setModalError(null);
    try {
      await api.post('/users', {
        name: formData.name,
        email: formData.email,
        password: formData.password,
        phone: formData.phone || undefined,
        role: formData.role,
        is_active: formData.is_active,
      });
      setShowAddModal(false);
      setFormData({
        name: '',
        email: '',
        password: '',
        phone: '',
        role: 'USER',
        is_active: true,
      });
      fetchUsers();
      onDataChange?.();
    } catch (error: any) {
      console.error('Failed to add user:', error);
      setModalError(error.response?.data?.message || 'Failed to add user');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditUser = async () => {
    if (!editTarget || !formData.name) return;
    setSubmitting(true);
    setModalError(null);
    try {
      await api.put(`/users/${editTarget.id}`, {
        name: formData.name,
        phone: formData.phone || undefined,
        role: formData.role,
        is_active: formData.is_active,
      });
      setShowEditModal(false);
      setEditTarget(null);
      setFormData({
        name: '',
        email: '',
        password: '',
        phone: '',
        role: 'USER',
        is_active: true,
      });
      fetchUsers();
      onDataChange?.();
    } catch (error: any) {
      console.error('Failed to edit user:', error);
      setModalError(error.response?.data?.message || 'Failed to update user');
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (user: UserData) => {
    setEditTarget(user);
    setFormData({
      name: user.name,
      email: user.email,
      password: '',
      phone: user.phone || '',
      role: user.role,
      is_active: user.is_active,
    });
    setShowEditModal(true);
    setOpenMenuId(null);
  };

  const openDelete = (user: UserData) => {
    setDeleteTarget(user);
    setShowDeleteModal(true);
    setOpenMenuId(null);
  };

  const openLink = (user: UserData) => {
    setLinkTarget(user);
    setShowLinkModal(true);
    setOpenMenuId(null);
  };

  const openAdd = () => {
    setFormData({
      name: '',
      email: '',
      password: '',
      phone: '',
      role: 'USER',
      is_active: true,
    });
    setModalError(null);
    setShowAddModal(true);
  };

  // Exclude org admins from selectable users
  const selectableUsers = users.filter((u) => !u.is_org_admin);

  const toggleSelect = (id: string) => {
    const user = users.find((u) => u.id === id);
    if (user?.is_org_admin) return; // Cannot select org admin
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === selectableUsers.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(selectableUsers.map((u) => u.id));
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  const formatDate = (date: string | null) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleString();
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return 'default';
      case 'MANAGER':
        return 'warning';
      default:
        return 'secondary';
    }
  };

  return (
    <Card className="bg-card/40 border-border">
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <CardTitle className="text-xl text-foreground flex items-center gap-2">
            <Users className="h-5 w-5" />
            Users
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-9 w-[200px]"
              />
            </div>
            <Button variant="outline" size="icon" onClick={() => fetchUsers()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button onClick={openAdd} className="gap-2">
              <Plus className="h-4 w-4" />
              Add User
            </Button>
          </div>
        </div>

        {selectedIds.length > 0 && (
          <div className="flex items-center gap-2 mt-4 p-2 bg-muted/50 rounded-lg">
            <span className="text-sm text-muted-foreground">
              {selectedIds.length} selected
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleToggleStatus(true)}
              className="gap-1"
            >
              <ToggleRight className="h-4 w-4" />
              Enable
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleToggleStatus(false)}
              className="gap-1"
            >
              <ToggleLeft className="h-4 w-4" />
              Disable
            </Button>
          </div>
        )}
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No users found
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <input
                      type="checkbox"
                      checked={
                        selectedIds.length === selectableUsers.length &&
                        selectableUsers.length > 0
                      }
                      onChange={toggleSelectAll}
                      className="rounded border-border"
                    />
                  </TableHead>
                  <TableHead className="w-12"></TableHead>
                  <TableHead
                    className="cursor-pointer select-none"
                    onClick={() => {
                      if (sortBy !== 'name') {
                        setSortBy('name');
                        setSortOrder('asc');
                      } else if (sortOrder === 'asc') {
                        setSortOrder('desc');
                      } else {
                        setSortBy(null);
                        setSortOrder(null);
                      }
                    }}
                  >
                    <div className="flex items-center gap-1">
                      Name
                      {sortBy === 'name' ? (
                        sortOrder === 'asc' ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )
                      ) : (
                        <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none"
                    onClick={() => {
                      if (sortBy !== 'email') {
                        setSortBy('email');
                        setSortOrder('asc');
                      } else if (sortOrder === 'asc') {
                        setSortOrder('desc');
                      } else {
                        setSortBy(null);
                        setSortOrder(null);
                      }
                    }}
                  >
                    <div className="flex items-center gap-1">
                      Email
                      {sortBy === 'email' ? (
                        sortOrder === 'asc' ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )
                      ) : (
                        <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none"
                    onClick={() => {
                      if (sortBy !== 'role') {
                        setSortBy('role');
                        setSortOrder('asc');
                      } else if (sortOrder === 'asc') {
                        setSortOrder('desc');
                      } else {
                        setSortBy(null);
                        setSortOrder(null);
                      }
                    }}
                  >
                    <div className="flex items-center gap-1">
                      Role
                      {sortBy === 'role' ? (
                        sortOrder === 'asc' ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )
                      ) : (
                        <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none"
                    onClick={() => {
                      if (sortBy !== 'is_active') {
                        setSortBy('is_active');
                        setSortOrder('asc');
                      } else if (sortOrder === 'asc') {
                        setSortOrder('desc');
                      } else {
                        setSortBy(null);
                        setSortOrder(null);
                      }
                    }}
                  >
                    <div className="flex items-center gap-1">
                      Status
                      {sortBy === 'is_active' ? (
                        sortOrder === 'asc' ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )
                      ) : (
                        <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </TableHead>
                  <TableHead className="w-16">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <>
                    <TableRow
                      key={user.id}
                      className={user.is_org_admin ? 'bg-primary/5' : ''}
                    >
                      <TableCell>
                        {user.is_org_admin ? (
                          <span
                            className="h-4 w-4 text-primary"
                            aria-label="Organization Admin - Protected"
                          >
                            <Shield className="h-4 w-4" />
                          </span>
                        ) : (
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(user.id)}
                            onChange={() => toggleSelect(user.id)}
                            className="rounded border-border"
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => toggleExpand(user.id)}
                          className="h-8 w-8"
                        >
                          {expandedIds.includes(user.id) ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {user.name}
                          {user.is_org_admin && (
                            <Badge variant="default" className="text-xs">
                              Org Admin
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {user.email}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getRoleBadgeVariant(user.role)}>
                          {user.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={user.is_active ? 'success' : 'destructive'}
                        >
                          {user.is_active ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {user.is_org_admin ? (
                          <span className="text-xs text-muted-foreground">
                            Protected
                          </span>
                        ) : (
                          <DropdownMenu
                            open={openMenuId === user.id}
                            onOpenChange={(open) =>
                              setOpenMenuId(open ? user.id : null)
                            }
                            trigger={
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            }
                          >
                            <DropdownMenuItem onClick={() => openEdit(user)}>
                              <Pencil className="h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openLink(user)}>
                              <Home className="h-4 w-4" />
                              Link Homes
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => openDelete(user)}
                            >
                              <Trash2 className="h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>

                    {expandedIds.includes(user.id) && (
                      <TableRow key={`${user.id}-expanded`}>
                        <TableCell colSpan={7} className="bg-muted/30 p-0">
                          <div className="p-4 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div>
                                <span className="text-sm text-muted-foreground">
                                  Email
                                </span>
                                <p className="font-medium">{user.email}</p>
                              </div>
                              <div>
                                <span className="text-sm text-muted-foreground">
                                  Phone
                                </span>
                                <p className="font-medium">
                                  {user.phone || 'N/A'}
                                </p>
                              </div>
                              <div>
                                <span className="text-sm text-muted-foreground">
                                  Role
                                </span>
                                <p className="font-medium">{user.role}</p>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-border pt-4">
                              <div>
                                <span className="text-sm text-muted-foreground">
                                  Created At
                                </span>
                                <p className="font-medium">
                                  {formatDate(user.created_at)}
                                </p>
                              </div>
                              <div>
                                <span className="text-sm text-muted-foreground">
                                  Updated At
                                </span>
                                <p className="font-medium">
                                  {formatDate(user.updated_at)}
                                </p>
                              </div>
                            </div>
                            {user.attributes &&
                              Object.keys(user.attributes).length > 0 && (
                                <div className="border-t border-border pt-4">
                                  <h4 className="text-sm font-semibold mb-2">
                                    Attributes
                                  </h4>
                                  <pre className="bg-background/50 p-3 rounded-lg text-xs font-mono overflow-x-auto">
                                    {JSON.stringify(user.attributes, null, 2)}
                                  </pre>
                                </div>
                              )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between mt-4">
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">
                  Total: {meta.itemCount} items
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Show:</span>
                  <select
                    value={take}
                    onChange={(e) => {
                      setTake(Number(e.target.value));
                      setPage(1);
                    }}
                    className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(1)}
                  disabled={meta.page === 1}
                >
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p - 1)}
                  disabled={!meta.hasPreviousPage}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm">
                  Page {meta.page} of {meta.pageCount}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!meta.hasNextPage}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(meta.pageCount)}
                  disabled={meta.page === meta.pageCount}
                >
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>

      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent onClose={() => setShowAddModal(false)}>
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
            <DialogDescription>
              Create a new user account in your organization.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name *</label>
              <Input
                placeholder="John Doe"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Email *</label>
              <Input
                type="email"
                placeholder="john@example.com"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Password *</label>
              <Input
                type="password"
                placeholder="••••••••"
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Phone</label>
              <Input
                placeholder="34666555444"
                value={formData.phone}
                onChange={(e) =>
                  setFormData({ ...formData, phone: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Role</label>
              <select
                value={formData.role}
                onChange={(e) =>
                  setFormData({ ...formData, role: e.target.value })
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option value="USER">User</option>
                <option value="MANAGER">Manager</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_active_add"
                checked={formData.is_active}
                onChange={(e) =>
                  setFormData({ ...formData, is_active: e.target.checked })
                }
                className="h-4 w-4 rounded border-border"
              />
              <label htmlFor="is_active_add" className="text-sm font-medium">
                Active
              </label>
            </div>
          </div>
          {modalError && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {modalError}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAddModal(false);
                setModalError(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleAddUser} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Add User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent onClose={() => setShowEditModal(false)}>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update user information.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name *</label>
              <Input
                placeholder="John Doe"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Phone</label>
              <Input
                placeholder="34666555444"
                value={formData.phone}
                onChange={(e) =>
                  setFormData({ ...formData, phone: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Role</label>
              <select
                value={formData.role}
                onChange={(e) =>
                  setFormData({ ...formData, role: e.target.value })
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option value="USER">User</option>
                <option value="MANAGER">Manager</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_active_edit"
                checked={formData.is_active}
                onChange={(e) =>
                  setFormData({ ...formData, is_active: e.target.checked })
                }
                className="h-4 w-4 rounded border-border"
              />
              <label htmlFor="is_active_edit" className="text-sm font-medium">
                Active
              </label>
            </div>
          </div>
          {modalError && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {modalError}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowEditModal(false);
                setModalError(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleEditUser} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent onClose={() => setShowDeleteModal(false)}>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteTarget?.name}"? This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {modalError && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {modalError}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteModal(false);
                setModalError(null);
              }}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link Homes Modal */}
      {linkTarget && (
        <LinkDialog
          open={showLinkModal}
          onClose={() => {
            setShowLinkModal(false);
            setLinkTarget(null);
            fetchUsers();
          }}
          title={`Link Homes to "${linkTarget.name}"`}
          entityId={linkTarget.id}
          fetchUrl={`/users/${linkTarget.id}/homes`}
          saveUrl="/users/homes/link"
          itemLabelKey="name"
          itemsKey="homes"
        />
      )}
    </Card>
  );
}
