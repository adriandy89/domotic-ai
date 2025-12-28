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
import {
  Cpu,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ToggleLeft,
  ToggleRight,
  Loader2,
  RefreshCw,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react';
import { api } from '../../lib/api';

interface DeviceData {
  id: string;
  name: string;
  unique_id: string;
  category: string | null;
  description: string | null;
  model: string | null;
  disabled: boolean;
  home_id: string | null;
  home: {
    id: string;
    name: string;
    unique_id: string;
  } | null;
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

export default function DevicesTable() {
  const [devices, setDevices] = useState<DeviceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [take] = useState(10);
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
  const [deleteTarget, setDeleteTarget] = useState<DeviceData | null>(null);
  const [editTarget, setEditTarget] = useState<DeviceData | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    unique_id: '',
    category: '',
    description: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    try {
      let url = `/devices?page=${page}&take=${take}`;
      if (search) url += `&search=${encodeURIComponent(search)}`;

      const response = await api.get<PaginatedResponse<DeviceData>>(url);
      setDevices(response.data.data);
      setMeta(response.data.meta);
    } catch (error) {
      console.error('Failed to fetch devices:', error);
    } finally {
      setLoading(false);
    }
  }, [page, take, search]);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleToggleStatus = async (enable: boolean) => {
    if (selectedIds.length === 0) return;
    try {
      const url = enable ? '/devices/enable/many' : '/devices/disable/many';
      await api.put(url, { uuids: selectedIds });
      setSelectedIds([]);
      fetchDevices();
    } catch (error) {
      console.error('Failed to toggle status:', error);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/devices/${deleteTarget.id}`);
      setDeleteTarget(null);
      setShowDeleteModal(false);
      fetchDevices();
    } catch (error) {
      console.error('Failed to delete device:', error);
    }
  };

  const handleAddDevice = async () => {
    if (!formData.name || !formData.unique_id) return;
    setSubmitting(true);
    try {
      await api.post('/devices', formData);
      setShowAddModal(false);
      setFormData({ name: '', unique_id: '', category: '', description: '' });
      fetchDevices();
    } catch (error) {
      console.error('Failed to add device:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditDevice = async () => {
    if (!editTarget || !formData.name) return;
    setSubmitting(true);
    try {
      await api.put(`/devices/${editTarget.id}`, {
        name: formData.name,
        category: formData.category,
        description: formData.description,
      });
      setShowEditModal(false);
      setEditTarget(null);
      setFormData({ name: '', unique_id: '', category: '', description: '' });
      fetchDevices();
    } catch (error) {
      console.error('Failed to edit device:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (device: DeviceData) => {
    setEditTarget(device);
    setFormData({
      name: device.name,
      unique_id: device.unique_id,
      category: device.category || '',
      description: device.description || '',
    });
    setShowEditModal(true);
    setOpenMenuId(null);
  };

  const openDelete = (device: DeviceData) => {
    setDeleteTarget(device);
    setShowDeleteModal(true);
    setOpenMenuId(null);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === devices.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(devices.map((d) => d.id));
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

  return (
    <Card className="bg-card/40 border-border">
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <CardTitle className="text-xl text-foreground flex items-center gap-2">
            <Cpu className="h-5 w-5" />
            Devices
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search devices..."
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-9 w-[200px]"
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => fetchDevices()}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button onClick={() => setShowAddModal(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Device
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
        ) : devices.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No devices found
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
                        selectedIds.length === devices.length &&
                        devices.length > 0
                      }
                      onChange={toggleSelectAll}
                      className="rounded border-border"
                    />
                  </TableHead>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Home</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Updated At</TableHead>
                  <TableHead className="w-16">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {devices.map((device) => (
                  <>
                    <TableRow key={device.id}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(device.id)}
                          onChange={() => toggleSelect(device.id)}
                          className="rounded border-border"
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => toggleExpand(device.id)}
                          className="h-8 w-8"
                        >
                          {expandedIds.includes(device.id) ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell className="font-medium">
                        {device.name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {device.category || '-'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {device.home?.name || '-'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={device.disabled ? 'destructive' : 'success'}
                        >
                          {device.disabled ? 'Disabled' : 'Enabled'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(device.updated_at)}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu
                          open={openMenuId === device.id}
                          onOpenChange={(open) =>
                            setOpenMenuId(open ? device.id : null)
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
                          <DropdownMenuItem onClick={() => openEdit(device)}>
                            <Pencil className="h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => openDelete(device)}
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>

                    {expandedIds.includes(device.id) && (
                      <TableRow key={`${device.id}-expanded`}>
                        <TableCell colSpan={8} className="bg-muted/30 p-0">
                          <div className="p-4 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div>
                                <span className="text-sm text-muted-foreground">
                                  Model
                                </span>
                                <p className="font-medium">
                                  {device.model || 'N/A'}
                                </p>
                              </div>
                              <div>
                                <span className="text-sm text-muted-foreground">
                                  Category
                                </span>
                                <p className="font-medium">
                                  {device.category || 'N/A'}
                                </p>
                              </div>
                              <div>
                                <span className="text-sm text-muted-foreground">
                                  Description
                                </span>
                                <p className="font-medium">
                                  {device.description || 'No description'}
                                </p>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-border pt-4">
                              <div>
                                <span className="text-sm text-muted-foreground">
                                  Home Name
                                </span>
                                <p className="font-medium">
                                  {device.home?.name || 'N/A'}
                                </p>
                              </div>
                              <div>
                                <span className="text-sm text-muted-foreground">
                                  Status
                                </span>
                                <p className="font-medium">
                                  {device.disabled ? 'Disabled' : 'Enabled'}
                                </p>
                              </div>
                              <div>
                                <span className="text-sm text-muted-foreground">
                                  Created At
                                </span>
                                <p className="font-medium">
                                  {formatDate(device.created_at)}
                                </p>
                              </div>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-muted-foreground">
                Showing {devices.length} of {meta.itemCount} devices
              </span>
              <div className="flex items-center gap-2">
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
              </div>
            </div>
          </>
        )}
      </CardContent>

      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent onClose={() => setShowAddModal(false)}>
          <DialogHeader>
            <DialogTitle>Add New Device</DialogTitle>
            <DialogDescription>
              Create a new device to track in your system.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name *</label>
              <Input
                placeholder="Living Room Light"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Unique ID *</label>
              <Input
                placeholder="0x00158d0001234567"
                value={formData.unique_id}
                onChange={(e) =>
                  setFormData({ ...formData, unique_id: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Category</label>
              <Input
                placeholder="light, sensor, switch..."
                value={formData.category}
                onChange={(e) =>
                  setFormData({ ...formData, category: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Input
                placeholder="Optional description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddDevice} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Add Device
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent onClose={() => setShowEditModal(false)}>
          <DialogHeader>
            <DialogTitle>Edit Device</DialogTitle>
            <DialogDescription>Update device information.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name *</label>
              <Input
                placeholder="Living Room Light"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Category</label>
              <Input
                placeholder="light, sensor, switch..."
                value={formData.category}
                onChange={(e) =>
                  setFormData({ ...formData, category: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Input
                placeholder="Optional description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditDevice} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent onClose={() => setShowDeleteModal(false)}>
          <DialogHeader>
            <DialogTitle>Delete Device</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteTarget?.name}"? This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteModal(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
