import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Loader2, X, Search, Check } from 'lucide-react';
import { api } from '../../lib/api';

interface LinkItem {
  id: string;
  name: string;
  disabled?: boolean;
  is_active?: boolean;
  linked: boolean;
  unique_id?: string;
  email?: string;
}

interface LinkDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  entityId: string;
  fetchUrl: string;
  saveUrl: string;
  itemLabelKey: 'name' | 'email';
  itemsKey: 'users' | 'homes';
}

export function LinkDialog({
  open,
  onClose,
  title,
  entityId,
  fetchUrl,
  saveUrl,
  itemLabelKey,
  itemsKey,
}: LinkDialogProps) {
  const [items, setItems] = useState<LinkItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [originalLinked, setOriginalLinked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      fetchItems();
    }
  }, [open, fetchUrl]);

  const fetchItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get(fetchUrl);
      const data = response.data[itemsKey] || [];
      setItems(data);

      const linked = new Set<string>(
        data
          .filter((item: LinkItem) => item.linked)
          .map((item: LinkItem) => item.id),
      );
      setSelectedIds(new Set(linked));
      setOriginalLinked(new Set(linked));
    } catch (err) {
      console.error('Failed to fetch items:', err);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSave = async () => {
    const toUpdate: string[] = [];
    const toDelete: string[] = [];

    // Items that are now selected but weren't originally linked
    selectedIds.forEach((id) => {
      if (!originalLinked.has(id)) {
        toUpdate.push(id);
      }
    });

    // Items that were originally linked but are now unselected
    originalLinked.forEach((id) => {
      if (!selectedIds.has(id)) {
        toDelete.push(id);
      }
    });

    if (toUpdate.length === 0 && toDelete.length === 0) {
      onClose();
      return;
    }

    setSaving(true);
    try {
      await api.post(saveUrl, {
        uuids: [entityId],
        toUpdate,
        toDelete,
      });
      onClose();
    } catch (err) {
      console.error('Failed to save links:', err);
      setError('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const filteredItems = items.filter((item) => {
    const label = item[itemLabelKey] || item.name || '';
    return label.toLowerCase().includes(search.toLowerCase());
  });

  const hasChanges = () => {
    if (selectedIds.size !== originalLinked.size) return true;
    for (const id of selectedIds) {
      if (!originalLinked.has(id)) return true;
    }
    return false;
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100]">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <div
          className="relative bg-card border border-border rounded-lg shadow-lg w-full max-w-lg max-h-[80vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Search */}
          <div className="p-4 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-background border border-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <div className="text-center py-8 text-destructive">{error}</div>
            ) : filteredItems.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No items found
              </div>
            ) : (
              <div className="space-y-2">
                {filteredItems.map((item) => (
                  <label
                    key={item.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onChange={() => handleToggle(item.id)}
                      className="h-4 w-4 rounded border-border"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">
                        {item[itemLabelKey] || item.name}
                      </div>
                      {item.unique_id && (
                        <div className="text-xs text-muted-foreground truncate">
                          {item.unique_id}
                        </div>
                      )}
                      {item.email && itemLabelKey === 'name' && (
                        <div className="text-xs text-muted-foreground truncate">
                          {item.email}
                        </div>
                      )}
                    </div>
                    <Badge
                      variant={
                        item.disabled || item.is_active === false
                          ? 'destructive'
                          : 'success'
                      }
                      className="text-xs"
                    >
                      {item.disabled || item.is_active === false
                        ? 'Disabled'
                        : 'Enabled'}
                    </Badge>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-4 border-t border-border">
            <div className="text-sm text-muted-foreground">
              {selectedIds.size} selected
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving || !hasChanges()}>
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                <Check className="h-4 w-4 mr-2" />
                Save
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
