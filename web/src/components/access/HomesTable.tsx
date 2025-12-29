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
  Home,
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
  Wifi,
  WifiOff,
  Copy,
  Check,
  MoreHorizontal,
  Pencil,
  Trash2,
  Users,
  AlertCircle,
  Eye,
  EyeOff,
} from 'lucide-react';
import { api } from '../../lib/api';

interface HomeData {
  id: string;
  name: string;
  unique_id: string;
  description: string | null;
  disabled: boolean;
  connected: boolean;
  created_at: string;
  updated_at: string | null;
  last_update: string | null;
  mqtt_username: string | null;
  mqtt_password: string | null;
  attributes: Record<string, unknown>;
  icon: string | null;
  image: string | null;
}

interface MqttConfig {
  mqttHost: string;
  mqttPort: number;
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

interface HomesTableProps {
  onDataChange?: () => void;
}

export default function HomesTable({ onDataChange }: HomesTableProps) {
  const getStoredPageSize = () => {
    const stored = localStorage.getItem('homesTable_pageSize');
    if (stored) {
      const num = parseInt(stored, 10);
      if (!isNaN(num) && num >= 5 && num <= 50) return num;
    }
    return 10;
  };

  const [homes, setHomes] = useState<HomeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [take, setTakeState] = useState(getStoredPageSize);

  const setTake = (value: number) => {
    const validValue = Math.max(5, Math.min(50, value));
    setTakeState(validValue);
    localStorage.setItem('homesTable_pageSize', String(validValue));
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
  const [deleteTarget, setDeleteTarget] = useState<HomeData | null>(null);
  const [editTarget, setEditTarget] = useState<HomeData | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkTarget, setLinkTarget] = useState<HomeData | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    disabled: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [mqttConfig, setMqttConfig] = useState<MqttConfig | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [visibleFields, setVisibleFields] = useState<Record<string, boolean>>(
    {},
  );
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | null>(null);

  const fetchHomes = useCallback(async () => {
    setLoading(true);
    try {
      let url = `/homes?page=${page}&take=${take}`;
      if (search) url += `&search=${encodeURIComponent(search)}`;
      if (sortBy && sortOrder) {
        url += `&orderBy=${sortBy}&sortOrder=${sortOrder}`;
      }

      const response = await api.get<PaginatedResponse<HomeData>>(url);
      setHomes(response.data.data);
      setMeta(response.data.meta);
    } catch (error) {
      console.error('Failed to fetch homes:', error);
    } finally {
      setLoading(false);
    }
  }, [page, take, search, sortBy, sortOrder]);

  const fetchMqttConfig = useCallback(async () => {
    try {
      const response = await api.get<MqttConfig>('/homes/mqtt/config');
      setMqttConfig(response.data);
    } catch (error) {
      console.error('Failed to fetch MQTT config:', error);
    }
  }, []);

  useEffect(() => {
    fetchHomes();
    fetchMqttConfig();
  }, [fetchHomes, fetchMqttConfig]);

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleToggleStatus = async (enable: boolean) => {
    if (selectedIds.length === 0) return;
    try {
      const url = enable ? '/homes/enable/many' : '/homes/disable/many';
      await api.put(url, { uuids: selectedIds });
      setSelectedIds([]);
      fetchHomes();
      onDataChange?.();
    } catch (error) {
      console.error('Failed to toggle status:', error);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/homes/${deleteTarget.id}`);
      setDeleteTarget(null);
      setShowDeleteModal(false);
      setModalError(null);
      fetchHomes();
      onDataChange?.();
    } catch (error: any) {
      console.error('Failed to delete home:', error);
      setModalError(error.response?.data?.message || 'Failed to delete home');
    }
  };

  const handleAddHome = async () => {
    if (!formData.name) return;
    setSubmitting(true);
    setModalError(null);
    try {
      await api.post('/homes', {
        name: formData.name,
        description: formData.description,
        disabled: formData.disabled,
      });
      setShowAddModal(false);
      setFormData({ name: '', description: '', disabled: false });
      fetchHomes();
      onDataChange?.();
    } catch (error: any) {
      console.error('Failed to add home:', error);
      setModalError(error.response?.data?.message || 'Failed to add home');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditHome = async () => {
    if (!editTarget || !formData.name) return;
    setSubmitting(true);
    setModalError(null);
    try {
      await api.put(`/homes/${editTarget.id}`, {
        name: formData.name,
        description: formData.description,
        disabled: formData.disabled,
      });
      setShowEditModal(false);
      setEditTarget(null);
      setFormData({ name: '', description: '', disabled: false });
      fetchHomes();
      onDataChange?.();
    } catch (error: any) {
      console.error('Failed to edit home:', error);
      setModalError(error.response?.data?.message || 'Failed to update home');
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (home: HomeData) => {
    setEditTarget(home);
    setFormData({
      name: home.name,
      description: home.description || '',
      disabled: home.disabled,
    });
    setShowEditModal(true);
    setOpenMenuId(null);
  };

  const openDelete = (home: HomeData) => {
    setDeleteTarget(home);
    setShowDeleteModal(true);
    setOpenMenuId(null);
  };

  const openLink = (home: HomeData) => {
    setLinkTarget(home);
    setShowLinkModal(true);
    setOpenMenuId(null);
  };

  const openAdd = () => {
    setFormData({
      name: '',
      description: '',
      disabled: false,
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
    if (selectedIds.length === homes.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(homes.map((h) => h.id));
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
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
            <Home className="h-5 w-5" />
            Homes
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search homes..."
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-9 w-[200px]"
              />
            </div>
            <Button variant="outline" size="icon" onClick={() => fetchHomes()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button onClick={openAdd} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Home
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
        ) : homes.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No homes found
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
                        selectedIds.length === homes.length && homes.length > 0
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
                      if (sortBy !== 'connected') {
                        setSortBy('connected');
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
                      Connection
                      {sortBy === 'connected' ? (
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
                      Status
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
                      if (sortBy !== 'last_update') {
                        setSortBy('last_update');
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
                      Last Update
                      {sortBy === 'last_update' ? (
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
                {homes.map((home) => (
                  <>
                    <TableRow key={home.id}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(home.id)}
                          onChange={() => toggleSelect(home.id)}
                          className="rounded border-border"
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => toggleExpand(home.id)}
                          className="h-8 w-8"
                        >
                          {expandedIds.includes(home.id) ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell className="font-medium">{home.name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {home.connected ? (
                            <Badge variant="success" className="gap-1">
                              <Wifi className="h-3 w-3" />
                              Connected
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="gap-1">
                              <WifiOff className="h-3 w-3" />
                              Disconnected
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={home.disabled ? 'destructive' : 'success'}
                        >
                          {home.disabled ? 'Disabled' : 'Enabled'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDate(home.last_update)}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu
                          open={openMenuId === home.id}
                          onOpenChange={(open) =>
                            setOpenMenuId(open ? home.id : null)
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
                          <DropdownMenuItem onClick={() => openEdit(home)}>
                            <Pencil className="h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openLink(home)}>
                            <Users className="h-4 w-4" />
                            Link Users
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => openDelete(home)}
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>

                    {/* Expanded Content */}
                    {expandedIds.includes(home.id) && (
                      <TableRow key={`${home.id}-expanded`}>
                        <TableCell colSpan={7} className="bg-muted/30 p-0">
                          <div className="p-4 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div>
                                <span className="text-sm text-muted-foreground">
                                  Description
                                </span>
                                <p className="font-medium">
                                  {home.description || 'No description'}
                                </p>
                              </div>
                              <div>
                                <span className="text-sm text-muted-foreground">
                                  Created At
                                </span>
                                <p className="font-medium">
                                  {formatDate(home.created_at)}
                                </p>
                              </div>
                              <div>
                                <span className="text-sm text-muted-foreground">
                                  Updated At
                                </span>
                                <p className="font-medium">
                                  {formatDate(home.updated_at)}
                                </p>
                              </div>
                            </div>

                            <div className="border-t border-border pt-4">
                              <h4 className="text-lg font-semibold mb-4 text-foreground">
                                MQTT Configuration
                              </h4>
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                <div className="bg-background/50 p-3 rounded-lg border border-border">
                                  <span className="text-xs text-muted-foreground uppercase">
                                    Host
                                  </span>
                                  <div className="flex items-center justify-between">
                                    <p className="font-mono text-sm">
                                      {visibleFields[`host-${home.id}`]
                                        ? `${mqttConfig?.mqttHost || 'N/A'}:${mqttConfig?.mqttPort || 'N/A'}`
                                        : '••••••••••••'}
                                    </p>
                                    <div className="flex gap-1">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6"
                                        onClick={() =>
                                          setVisibleFields((prev) => ({
                                            ...prev,
                                            [`host-${home.id}`]:
                                              !prev[`host-${home.id}`],
                                          }))
                                        }
                                      >
                                        {visibleFields[`host-${home.id}`] ? (
                                          <EyeOff className="h-3 w-3" />
                                        ) : (
                                          <Eye className="h-3 w-3" />
                                        )}
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6"
                                        onClick={() =>
                                          copyToClipboard(
                                            `${mqttConfig?.mqttHost}:${mqttConfig?.mqttPort}`,
                                            `host-${home.id}`,
                                          )
                                        }
                                      >
                                        {copiedField === `host-${home.id}` ? (
                                          <Check className="h-3 w-3 text-emerald-500" />
                                        ) : (
                                          <Copy className="h-3 w-3" />
                                        )}
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                                <div className="bg-background/50 p-3 rounded-lg border border-border">
                                  <span className="text-xs text-muted-foreground uppercase">
                                    Username
                                  </span>
                                  <div className="flex items-center justify-between">
                                    <p className="font-mono text-sm">
                                      {visibleFields[`user-${home.id}`]
                                        ? home.mqtt_username || 'N/A'
                                        : '••••••••'}
                                    </p>
                                    <div className="flex gap-1">
                                      {home.mqtt_username && (
                                        <>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6"
                                            onClick={() =>
                                              setVisibleFields((prev) => ({
                                                ...prev,
                                                [`user-${home.id}`]:
                                                  !prev[`user-${home.id}`],
                                              }))
                                            }
                                          >
                                            {visibleFields[
                                              `user-${home.id}`
                                            ] ? (
                                              <EyeOff className="h-3 w-3" />
                                            ) : (
                                              <Eye className="h-3 w-3" />
                                            )}
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6"
                                            onClick={() =>
                                              copyToClipboard(
                                                home.mqtt_username!,
                                                `user-${home.id}`,
                                              )
                                            }
                                          >
                                            {copiedField ===
                                            `user-${home.id}` ? (
                                              <Check className="h-3 w-3 text-emerald-500" />
                                            ) : (
                                              <Copy className="h-3 w-3" />
                                            )}
                                          </Button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div className="bg-background/50 p-3 rounded-lg border border-border">
                                  <span className="text-xs text-muted-foreground uppercase">
                                    Password
                                  </span>
                                  <div className="flex items-center justify-between">
                                    <p className="font-mono text-sm">
                                      {visibleFields[`pass-${home.id}`]
                                        ? home.mqtt_password || 'N/A'
                                        : '••••••••'}
                                    </p>
                                    <div className="flex gap-1">
                                      {home.mqtt_password && (
                                        <>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6"
                                            onClick={() =>
                                              setVisibleFields((prev) => ({
                                                ...prev,
                                                [`pass-${home.id}`]:
                                                  !prev[`pass-${home.id}`],
                                              }))
                                            }
                                          >
                                            {visibleFields[
                                              `pass-${home.id}`
                                            ] ? (
                                              <EyeOff className="h-3 w-3" />
                                            ) : (
                                              <Eye className="h-3 w-3" />
                                            )}
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6"
                                            onClick={() =>
                                              copyToClipboard(
                                                home.mqtt_password!,
                                                `pass-${home.id}`,
                                              )
                                            }
                                          >
                                            {copiedField ===
                                            `pass-${home.id}` ? (
                                              <Check className="h-3 w-3 text-emerald-500" />
                                            ) : (
                                              <Copy className="h-3 w-3" />
                                            )}
                                          </Button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div className="bg-background/50 p-3 rounded-lg border border-border">
                                  <span className="text-xs text-muted-foreground uppercase">
                                    Client ID
                                  </span>
                                  <div className="flex items-center justify-between">
                                    <p className="font-mono text-sm">
                                      {visibleFields[`client-${home.id}`]
                                        ? home.mqtt_username || 'N/A'
                                        : '••••••••'}
                                    </p>
                                    <div className="flex gap-1">
                                      {home.mqtt_username && (
                                        <>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6"
                                            onClick={() =>
                                              setVisibleFields((prev) => ({
                                                ...prev,
                                                [`client-${home.id}`]:
                                                  !prev[`client-${home.id}`],
                                              }))
                                            }
                                          >
                                            {visibleFields[
                                              `client-${home.id}`
                                            ] ? (
                                              <EyeOff className="h-3 w-3" />
                                            ) : (
                                              <Eye className="h-3 w-3" />
                                            )}
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6"
                                            onClick={() =>
                                              copyToClipboard(
                                                home.mqtt_username!,
                                                `client-${home.id}`,
                                              )
                                            }
                                          >
                                            {copiedField ===
                                            `client-${home.id}` ? (
                                              <Check className="h-3 w-3 text-emerald-500" />
                                            ) : (
                                              <Copy className="h-3 w-3" />
                                            )}
                                          </Button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div className="bg-background/50 p-3 rounded-lg border border-border md:col-span-2">
                                  <span className="text-xs text-muted-foreground uppercase">
                                    Base Topic
                                  </span>
                                  <div className="flex items-center justify-between">
                                    <p className="font-mono text-sm">
                                      {visibleFields[`topic-${home.id}`]
                                        ? `home/id/${home.mqtt_username}`
                                        : '••••••••••••••'}
                                    </p>
                                    <div className="flex gap-1">
                                      {home.mqtt_username && (
                                        <>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6"
                                            onClick={() =>
                                              setVisibleFields((prev) => ({
                                                ...prev,
                                                [`topic-${home.id}`]:
                                                  !prev[`topic-${home.id}`],
                                              }))
                                            }
                                          >
                                            {visibleFields[
                                              `topic-${home.id}`
                                            ] ? (
                                              <EyeOff className="h-3 w-3" />
                                            ) : (
                                              <Eye className="h-3 w-3" />
                                            )}
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6"
                                            onClick={() =>
                                              copyToClipboard(
                                                `home/id/${home.mqtt_username}`,
                                                `topic-${home.id}`,
                                              )
                                            }
                                          >
                                            {copiedField ===
                                            `topic-${home.id}` ? (
                                              <Check className="h-3 w-3 text-emerald-500" />
                                            ) : (
                                              <Copy className="h-3 w-3" />
                                            )}
                                          </Button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
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

      {/* Add Home Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent onClose={() => setShowAddModal(false)}>
          <DialogHeader>
            <DialogTitle>Add New Home</DialogTitle>
            <DialogDescription>
              Create a new home to manage devices and users.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name *</label>
              <Input
                placeholder="My Home"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
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
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="disabled_add"
                checked={formData.disabled}
                onChange={(e) =>
                  setFormData({ ...formData, disabled: e.target.checked })
                }
                className="h-4 w-4 rounded border-border"
              />
              <label htmlFor="disabled_add" className="text-sm font-medium">
                Disabled
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
            <Button onClick={handleAddHome} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Add Home
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Home Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent onClose={() => setShowEditModal(false)}>
          <DialogHeader>
            <DialogTitle>Edit Home</DialogTitle>
            <DialogDescription>Update home information.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name *</label>
              <Input
                placeholder="My Home"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
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
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="disabled_edit"
                checked={formData.disabled}
                onChange={(e) =>
                  setFormData({ ...formData, disabled: e.target.checked })
                }
                className="h-4 w-4 rounded border-border"
              />
              <label htmlFor="disabled_edit" className="text-sm font-medium">
                Disabled
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
            <Button onClick={handleEditHome} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent onClose={() => setShowDeleteModal(false)}>
          <DialogHeader>
            <DialogTitle>Delete Home</DialogTitle>
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

      {/* Link Users Modal */}
      {linkTarget && (
        <LinkDialog
          open={showLinkModal}
          onClose={() => {
            setShowLinkModal(false);
            setLinkTarget(null);
            fetchHomes();
          }}
          title={`Link Users to "${linkTarget.name}"`}
          entityId={linkTarget.id}
          fetchUrl={`/homes/${linkTarget.id}/users`}
          saveUrl="/homes/users/link"
          itemLabelKey="name"
          itemsKey="users"
        />
      )}
    </Card>
  );
}
