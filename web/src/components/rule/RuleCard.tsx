import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardFooter, CardHeader } from '../ui/card';
import { Button } from '../ui/button';
import { formatDate } from '../../lib/format';
import {
  Edit,
  Power,
  PowerOff,
  Trash2,
  MoreVertical,
  Zap,
  GitBranch,
  Home,
  HeartPulse,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import type { Rule } from '../../store/useRulesStore';
import { ruleHasCareSignals } from '../../lib/rule-templates';
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

export default function RuleCard({
  rule,
  onToggle,
  onDelete,
  onEdit,
}: RuleCardProps) {
  const { t } = useTranslation();
  const [isToggling, setIsToggling] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const { homes } = useHomesStore();

  useEffect(() => {
    if (!showActions) return;
    const onClickOutside = (e: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setShowActions(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [showActions]);

  const handleToggle = async () => {
    setIsToggling(true);
    await onToggle(rule.id, !rule.active);
    setIsToggling(false);
  };

  const handleDelete = async () => {
    await onDelete(rule.id);
    setShowDeleteDialog(false);
  };

  const homeName = homes[rule.home_id]?.name || t('rules.card.unknownHome');
  const isCare = ruleHasCareSignals(rule);

  return (
    <>
      <Card
        className={cn(
          'bg-card/50 hover:bg-card/70 transition-all duration-300 border-border/50 hover:border-primary/30 group relative h-full flex flex-col',
          rule.active && 'border-emerald-500/30 hover:border-emerald-500/50',
        )}
      >
        <CardHeader className="p-4 pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-foreground truncate">
                  {rule.name}
                </h3>
                <div className="text-xs capitalize bg-primary/10 text-primary rounded px-2 py-1">
                  {rule.type.toLowerCase()}
                </div>
                {isCare && (
                  <div className="flex items-center gap-1 text-xs bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded px-2 py-1">
                    <HeartPulse className="w-3 h-3" />
                    {t('rules.care.badge')}
                  </div>
                )}
              </div>

              <p className="text-xs text-muted-foreground line-clamp-1 truncate h-4">
                {rule.description || ' '}
              </p>
            </div>

            {/* Actions Menu */}
            <div className="relative" ref={actionsRef}>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setShowActions(!showActions)}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>

              {showActions && (
                <div className="absolute right-0 top-8 z-50 bg-card border border-border rounded-lg shadow-lg p-1 min-w-[120px]">
                  {onEdit && (
                    <button
                      onClick={() => {
                        onEdit(rule.id);
                        setShowActions(false);
                      }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-accent rounded-md transition-colors"
                    >
                      <Edit className="h-4 w-4" />
                      {t('common.edit')}
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
                    {t('common.delete')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 p-4 pt-2">
          <div className="flex items-center gap-4">
            {/* Stats */}
            <div className="flex-1 flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5 text-sm">
                <GitBranch className="w-4 h-4 text-amber-500" />
                <span className="text-muted-foreground">
                  {rule._count.conditions}
                </span>
                <span className="text-xs text-muted-foreground/70">
                  {t('rules.card.conditions')}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-sm">
                <Zap className="w-4 h-4 text-blue-500" />
                <span className="text-muted-foreground">
                  {rule._count.results}
                </span>
                <span className="text-xs text-muted-foreground/70">
                  {t('rules.card.actions')}
                </span>
              </div>
            </div>

            {/* Power Toggle */}
            <Button
              className={cn(
                'w-14 h-14 rounded-full flex flex-col items-center justify-center cursor-pointer transition-all duration-300',
                rule.active
                  ? 'bg-linear-to-b from-emerald-400 to-emerald-600 shadow-[0_0_20px_rgba(52,211,153,0.4)] hover:shadow-[0_0_25px_rgba(52,211,153,0.6)]'
                  : 'bg-linear-to-b from-muted to-muted-foreground/50 opacity-60 hover:opacity-80',
                isToggling && 'opacity-50 scale-95',
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

        <CardFooter className="p-4 pt-2 border-t border-border/30">
          <div className="flex items-center justify-between w-full text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <span>{rule.timestamp ? formatDate(rule.timestamp) : '—'}</span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-muted/50 rounded text-muted-foreground">
              <Home className="w-3 h-3" />
              <span>{homeName}</span>
            </div>
          </div>
        </CardFooter>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('rules.card.deleteTitle')}</DialogTitle>
            <DialogDescription>
              {t('common.confirmDelete', { name: rule.name })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
