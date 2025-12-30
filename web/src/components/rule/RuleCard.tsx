import { useState } from 'react';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../ui/card';
import { Button } from '../ui/button';
import {
  Edit,
  Power,
  PowerOff,
  Trash2,
  MoreVertical,
  Zap,
  GitBranch,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import type { Rule } from '../../store/useRulesStore';
import { useHomesStore } from '../../store/useHomesStore';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

interface RuleCardProps {
  rule: Rule;
  onToggle: (id: string, active: boolean) => void;
  onDelete: (id: string) => void;
  onEdit?: (id: string) => void;
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function RuleCard({
  rule,
  onToggle,
  onDelete,
  onEdit,
}: RuleCardProps) {
  const [isToggling, setIsToggling] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const { homes } = useHomesStore();

  const handleToggle = async () => {
    setIsToggling(true);
    await onToggle(rule.id, !rule.active);
    setIsToggling(false);
  };

  const handleDelete = async () => {
    await onDelete(rule.id);
    setShowDeleteDialog(false);
  };

  const homeName = homes[rule.home_id]?.name || 'Unknown';

  return (
    <>
      <Card className="bg-card/50 hover:bg-card/70 transition-all duration-300 border-border/50 hover:border-primary/30 group relative h-full flex flex-col">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base font-semibold truncate flex-1">
              {rule.name}
            </CardTitle>
            <div className="flex items-center gap-1 relative">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setShowActions(!showActions)}
                title="Actions"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>

              {/* Action dropdown */}
              {showActions && (
                <div className="absolute right-0 top-8 z-10 bg-card border border-border rounded-lg shadow-lg p-1 min-w-[120px]">
                  {onEdit && (
                    <button
                      onClick={() => {
                        onEdit(rule.id);
                        setShowActions(false);
                      }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-accent rounded-md transition-colors"
                    >
                      <Edit className="h-4 w-4" />
                      Edit
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setShowDeleteDialog(true);
                      setShowActions(false);
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-500 hover:bg-red-500/10 rounded-md transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>
          {rule.description && (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {rule.description}
            </p>
          )}
        </CardHeader>

        <CardContent className="flex-1 pb-2">
          <div className="flex items-center gap-4">
            {/* Stats */}
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <GitBranch className="w-4 h-4 text-amber-500" />
                <span className="text-muted-foreground">Conditions:</span>
                <span className="font-medium">{rule._count.conditions}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Zap className="w-4 h-4 text-blue-500" />
                <span className="text-muted-foreground">Actions:</span>
                <span className="font-medium">{rule._count.results}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span
                  className={cn(
                    'px-2 py-0.5 rounded-full text-xs font-medium',
                    rule.all
                      ? 'bg-purple-500/20 text-purple-400'
                      : 'bg-cyan-500/20 text-cyan-400',
                  )}
                >
                  {rule.all ? 'All match' : 'Any match'}
                </span>
              </div>
              <div className="text-xs text-muted-foreground capitalize">
                {rule.type.toLowerCase()}
              </div>
            </div>

            {/* Power Toggle Button */}
            <Button
              className={cn(
                'w-16 h-16 rounded-full flex flex-col items-center justify-center cursor-pointer transition-all duration-300',
                rule.active
                  ? 'bg-gradient-to-b from-emerald-400 to-emerald-600 shadow-[0_0_20px_rgba(52,211,153,0.5)] hover:shadow-[0_0_30px_rgba(52,211,153,0.7)]'
                  : 'bg-gradient-to-b from-gray-400 to-gray-600 opacity-70 hover:opacity-90',
              )}
              onClick={handleToggle}
              disabled={isToggling}
              variant="ghost"
            >
              <div className="flex flex-col items-center gap-0.5">
                {rule.active ? (
                  <Power className="w-5 h-5 text-white" />
                ) : (
                  <PowerOff className="w-5 h-5 text-white" />
                )}
                <span className="text-[10px] text-white font-medium">
                  {rule.active ? 'ON' : 'OFF'}
                </span>
              </div>
            </Button>
          </div>
        </CardContent>

        <CardFooter className="pt-2 border-t border-border/30">
          <div className="flex items-center justify-between w-full text-xs text-muted-foreground">
            <span>{rule.timestamp ? formatDate(rule.timestamp) : '—'}</span>
            <span className="px-2 py-0.5 bg-muted/50 rounded text-muted-foreground">
              {homeName}
            </span>
          </div>
        </CardFooter>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Rule</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{rule.name}"? This action cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
