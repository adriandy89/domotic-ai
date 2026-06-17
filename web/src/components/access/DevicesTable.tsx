import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useHomesStore } from '../../store/useHomesStore';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { PROTOCOL_CATALOG } from '../../lib/integration-templates';
import {
  Cpu,
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
  AlertCircle,
} from 'lucide-react';
import { api } from '../../lib/api';

interface DeviceData {
  id: string;
  name: string;
  unique_id: string;
  category: string | null;
  protocol: string;
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

interface DevicesTableProps {
  onDataChange?: () => void;
}

export default function DevicesTable({ onDataChange }: DevicesTableProps) {
  const { t } = useTranslation();
  const getStoredPageSize = () => {
    const stored = localStorage.getItem('devicesTable_pageSize');
    if (stored) {
      const num = parseInt(stored, 10);
      if (!isNaN(num) && num >= 5 && num <= 50) return num;
    }
    return 10;
  };

  const [devices, setDevices] = useState<DeviceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [take, setTakeState] = useState(getStoredPageSize);

  const setTake = (value: number) => {
    const validValue = Math.max(5, Math.min(50, value));
    setTakeState(validValue);
    localStorage.setItem('devicesTable_pageSize', String(validValue));
  };

  const [search, setSearch] = useState('');
  const [homeFilter, setHomeFilter] = useState('');
  const [protocolFilter, setProtocolFilter] = useState('');
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
    disabled: false,
    home_id: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | null>(null);
  const { homes, homeIds } = useHomesStore();

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    try {
      let url = `/devices?page=${page}&take=${take}`;
      if (search) url += `&search=${encodeURIComponent(search)}`;
      if (homeFilter) url += `&home_id=${encodeURIComponent(homeFilter)}`;
      if (protocolFilter)
        url += `&protocol=${encodeURIComponent(protocolFilter)}`;
      if (sortBy && sortOrder) {
        url += `&orderBy=${sortBy}&sortOrder=${sortOrder}`;
      }

      const response = await api.get<PaginatedResponse<DeviceData>>(url);
      setDevices(response.data.data);
      setMeta(response.data.meta);
    } catch (error: any) {
      console.error('Failed to fetch devices:', error);
    } finally {
      setLoading(false);
    }
  }, [page, take, search, homeFilter, protocolFilter, sortBy, sortOrder]);

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
      onDataChange?.();
    } catch (error: any) {
      console.error('Failed to toggle status:', error);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/devices/${deleteTarget.id}`);
      setDeleteTarget(null);
      setShowDeleteModal(false);
      setModalError(null);
      fetchDevices();
      onDataChange?.();
    } catch (error: any) {
      console.error('Failed to delete device:', error);
      setModalError(
        error.response?.data?.message || t('access.devices.deleteError'),
      );
    }
  };

  const handleAddDevice = async () => {
    if (!formData.name || !formData.unique_id || !formData.home_id) return;
    setSubmitting(true);
    setModalError(null);
    try {
      await api.post('/devices', {
        name: formData.name,
        unique_id: formData.unique_id,
        category: formData.category,
        description: formData.description,
        disabled: formData.disabled,
        home_id: formData.home_id,
      });
      setShowAddModal(false);
      setFormData({
        name: '',
        unique_id: '',
        category: '',
        description: '',
        disabled: false,
        home_id: '',
      });
      fetchDevices();
      onDataChange?.();
    } catch (error: any) {
      console.error('Failed to add device:', error);
      setModalError(
        error.response?.data?.message || t('access.devices.addError'),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditDevice = async () => {
    if (!editTarget || !formData.name) return;
    setSubmitting(true);
    setModalError(null);
    try {
      await api.put(`/devices/${editTarget.id}`, {
        name: formData.name,
        category: formData.category,
        description: formData.description,
        disabled: formData.disabled,
        home_id: formData.home_id || undefined,
      });
      setShowEditModal(false);
      setEditTarget(null);
      setFormData({
        name: '',
        unique_id: '',
        category: '',
        description: '',
        disabled: false,
        home_id: '',
      });
      fetchDevices();
      onDataChange?.();
    } catch (error: any) {
      console.error('Failed to edit device:', error);
      setModalError(
        error.response?.data?.message || t('access.devices.updateError'),
      );
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
      disabled: device.disabled,
      home_id: device.home_id || '',
    });
    setShowEditModal(true);
    setOpenMenuId(null);
  };

  const openDelete = (device: DeviceData) => {
    setDeleteTarget(device);
    setShowDeleteModal(true);
    setOpenMenuId(null);
  };

  const openAdd = () => {
    setFormData({
      name: '',
      unique_id: '',
      category: '',
      description: '',
      disabled: false,
      home_id: '',
    });
    setModalError(null);
    setShowAddModal(true);
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
    if (!date) return t('common.na');
    return new Date(date).toLocaleString();
  };

  const protocolLabel = (p: string) =>
    PROTOCOL_CATALOG.find((x) => x.protocol === p)?.label ?? p;

  return (
    <Card className="bg-card/40 border-border">
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <CardTitle className="text-xl text-foreground flex items-center gap-2">
            <Cpu className="h-5 w-5" />
            {t('access.devices.title')}
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('access.devices.searchPlaceholder')}
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
            <Button onClick={openAdd} className="gap-2">
              <Plus className="h-4 w-4" />
              {t('access.devices.add')}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {t('common.home')}
            </span>
            <Select
              value={homeFilter}
              onValueChange={(v) => {
                setHomeFilter(v === 'all' ? '' : v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder={t('common.allHomes')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.allHomes')}</SelectItem>
                {homeIds.map((id) => (
                  <SelectItem key={id} value={id}>
                    {homes[id]?.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {t('access.devices.filterType')}
            </span>
            <Select
              value={protocolFilter}
              onValueChange={(v) => {
                setProtocolFilter(v === 'all' ? '' : v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-35">
                <SelectValue placeholder={t('access.devices.allTypes')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t('access.devices.allTypes')}
                </SelectItem>
                {PROTOCOL_CATALOG.map((p) => (
                  <SelectItem key={p.protocol} value={p.protocol}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(homeFilter || protocolFilter) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setHomeFilter('');
                setProtocolFilter('');
                setPage(1);
              }}
            >
              {t('common.clearFilters')}
            </Button>
          )}
        </div>

        {selectedIds.length > 0 && (
          <div className="flex items-center gap-2 mt-4 p-2 bg-muted/50 rounded-lg">
            <span className="text-sm text-muted-foreground">
              {t('common.selected', { count: selectedIds.length })}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleToggleStatus(true)}
              className="gap-1"
            >
              <ToggleRight className="h-4 w-4" />
              {t('common.enable')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleToggleStatus(false)}
              className="gap-1"
            >
              <ToggleLeft className="h-4 w-4" />
              {t('common.disable')}
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
            {t('access.devices.empty')}
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
                      {t('common.name')}
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
                      if (sortBy !== 'category') {
                        setSortBy('category');
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
                      {t('common.category')}
                      {sortBy === 'category' ? (
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
                      if (sortBy !== 'protocol') {
                        setSortBy('protocol');
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
                      {t('common.type')}
                      {sortBy === 'protocol' ? (
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
                      if (sortBy !== 'home') {
                        setSortBy('home');
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
                      {t('common.home')}
                      {sortBy === 'home' ? (
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
                      if (sortBy !== 'disabled') {
                        setSortBy('disabled');
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
                      {t('common.status')}
                      {sortBy === 'disabled' ? (
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
                      if (sortBy !== 'updated_at') {
                        setSortBy('updated_at');
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
                      {t('common.updatedAt')}
                      {sortBy === 'updated_at' ? (
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
                  <TableHead className="w-16">{t('common.actions')}</TableHead>
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
                      <TableCell>
                        <Badge variant="outline">
                          {device.protocol ? protocolLabel(device.protocol) : '-'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {device.home?.name || '-'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={device.disabled ? 'destructive' : 'success'}
                        >
                          {device.disabled ? t('common.disabled') : t('common.enabled')}
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
                            {t('common.edit')}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => openDelete(device)}
                          >
                            <Trash2 className="h-4 w-4" />
                            {t('common.delete')}
                          </DropdownMenuItem>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>

                    {expandedIds.includes(device.id) && (
                      <TableRow key={`${device.id}-expanded`}>
                        <TableCell colSpan={9} className="bg-muted/30 p-0">
                          <div className="p-4 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div>
                                <span className="text-sm text-muted-foreground">
                                  {t('access.devices.model')}
                                </span>
                                <p className="font-medium">
                                  {device.model || t('common.na')}
                                </p>
                              </div>
                              <div>
                                <span className="text-sm text-muted-foreground">
                                  {t('common.category')}
                                </span>
                                <p className="font-medium">
                                  {device.category || t('common.na')}
                                </p>
                              </div>
                              <div>
                                <span className="text-sm text-muted-foreground">
                                  {t('common.description')}
                                </span>
                                <p className="font-medium">
                                  {device.description || t('common.noDescription')}
                                </p>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-border pt-4">
                              <div>
                                <span className="text-sm text-muted-foreground">
                                  {t('access.devices.homeName')}
                                </span>
                                <p className="font-medium">
                                  {device.home?.name || t('common.na')}
                                </p>
                              </div>
                              <div>
                                <span className="text-sm text-muted-foreground">
                                  {t('common.status')}
                                </span>
                                <p className="font-medium">
                                  {device.disabled ? t('common.disabled') : t('common.enabled')}
                                </p>
                              </div>
                              <div>
                                <span className="text-sm text-muted-foreground">
                                  {t('common.createdAt')}
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
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">
                  {t('access.table.totalItems', { count: meta.itemCount })}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {t('access.table.show')}
                  </span>
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
                  {t('access.table.pageOf', {
                    page: meta.page,
                    pageCount: meta.pageCount,
                  })}
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
            <DialogTitle>{t('access.devices.addTitle')}</DialogTitle>
            <DialogDescription>{t('access.devices.addDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {t('access.form.nameRequired')}
              </label>
              <Input
                placeholder={t('access.devices.namePlaceholder')}
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {t('access.devices.uniqueIdRequired')}
              </label>
              <Input
                placeholder={t('access.devices.uniqueIdPlaceholder')}
                value={formData.unique_id}
                onChange={(e) =>
                  setFormData({ ...formData, unique_id: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {t('common.category')}
              </label>
              <Input
                placeholder={t('access.devices.categoryPlaceholder')}
                value={formData.category}
                onChange={(e) =>
                  setFormData({ ...formData, category: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {t('common.description')}
              </label>
              <Input
                placeholder={t('access.form.optionalDescription')}
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {t('access.devices.homeRequired')}
              </label>
              <select
                value={formData.home_id}
                onChange={(e) =>
                  setFormData({ ...formData, home_id: e.target.value })
                }
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">{t('access.devices.selectHome')}</option>
                {homeIds.map((id) => (
                  <option key={id} value={id}>
                    {homes[id]?.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="add-disabled"
                checked={formData.disabled}
                onChange={(e) =>
                  setFormData({ ...formData, disabled: e.target.checked })
                }
                className="rounded border-border"
              />
              <label htmlFor="add-disabled" className="text-sm font-medium">
                {t('access.form.disabledLabel')}
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
              {t('common.cancel')}
            </Button>
            <Button onClick={handleAddDevice} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {t('access.devices.add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent onClose={() => setShowEditModal(false)}>
          <DialogHeader>
            <DialogTitle>{t('access.devices.editTitle')}</DialogTitle>
            <DialogDescription>{t('access.devices.editDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {t('access.form.nameRequired')}
              </label>
              <Input
                placeholder={t('access.devices.namePlaceholder')}
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {t('common.category')}
              </label>
              <Input
                placeholder={t('access.devices.categoryPlaceholder')}
                value={formData.category}
                onChange={(e) =>
                  setFormData({ ...formData, category: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {t('common.description')}
              </label>
              <Input
                placeholder={t('access.form.optionalDescription')}
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('common.home')}</label>
              <select
                value={formData.home_id}
                onChange={(e) =>
                  setFormData({ ...formData, home_id: e.target.value })
                }
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">{t('access.devices.selectHome')}</option>
                {homeIds.map((id) => (
                  <option key={id} value={id}>
                    {homes[id]?.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="edit-disabled"
                checked={formData.disabled}
                onChange={(e) =>
                  setFormData({ ...formData, disabled: e.target.checked })
                }
                className="rounded border-border"
              />
              <label htmlFor="edit-disabled" className="text-sm font-medium">
                {t('access.form.disabledLabel')}
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
              {t('common.cancel')}
            </Button>
            <Button onClick={handleEditDevice} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {t('access.form.saveChanges')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent onClose={() => setShowDeleteModal(false)}>
          <DialogHeader>
            <DialogTitle>{t('access.devices.deleteTitle')}</DialogTitle>
            <DialogDescription>
              {t('common.confirmDelete', { name: deleteTarget?.name })}
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
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
