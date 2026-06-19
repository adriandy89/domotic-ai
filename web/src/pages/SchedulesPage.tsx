import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  CalendarClock,
  Plus,
  Loader2,
  Filter,
  Home,
  Repeat,
  Clock,
} from 'lucide-react';
import { useSchedulesStore } from '../store/useSchedulesStore';
import { useHomesStore } from '../store/useHomesStore';
import ScheduleCard from '../components/schedule/ScheduleCard';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';

export default function SchedulesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    schedules,
    isLoading,
    error,
    fetchSchedules,
    toggleSchedule,
    deleteSchedule,
  } = useSchedulesStore();
  const { homes, homeIds } = useHomesStore();
  const [selectedHomeId, setSelectedHomeId] = useState<string | null>(null);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  const filteredSchedules = useMemo(() => {
    if (!selectedHomeId) return schedules;
    return schedules.filter((s) => s.home_id === selectedHomeId);
  }, [schedules, selectedHomeId]);

  const homeList = useMemo(() => {
    return homeIds.map((id) => homes[id]).filter(Boolean);
  }, [homeIds, homes]);

  const recurrentCount = useMemo(
    () =>
      schedules.filter(
        (s) => s.frequency === 'DAILY' || s.frequency === 'CUSTOM',
      ).length,
    [schedules],
  );
  const onceCount = useMemo(
    () => schedules.filter((s) => s.frequency === 'ONCE').length,
    [schedules],
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">
            {t('schedules.title')}
          </h2>
          <p className="text-muted-foreground mt-1">{t('schedules.subtitle')}</p>
        </div>
        <Button
          className="flex items-center gap-2"
          onClick={() => navigate('/schedules/new')}
        >
          <Plus className="w-4 h-4" />
          {t('schedules.new')}
        </Button>
      </div>

      {/* Stats Summary */}
      {schedules.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="bg-card/40 border-border">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-primary">
                {schedules.length}
              </div>
              <div className="text-xs text-muted-foreground">
                {t('schedules.stats.total')}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card/40 border-border">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-emerald-500">
                {schedules.filter((s) => s.active).length}
              </div>
              <div className="text-xs text-muted-foreground">
                {t('common.active')}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card/40 border-border">
            <CardContent className="p-4 text-center">
              <div className="flex items-center justify-center gap-1 text-2xl font-bold text-violet-500">
                <Repeat className="w-5 h-5" />
                {recurrentCount}
              </div>
              <div className="text-xs text-muted-foreground">
                {t('schedules.stats.recurrent')}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card/40 border-border">
            <CardContent className="p-4 text-center">
              <div className="flex items-center justify-center gap-1 text-2xl font-bold text-blue-500">
                <Clock className="w-5 h-5" />
                {onceCount}
              </div>
              <div className="text-xs text-muted-foreground">
                {t('schedules.stats.once')}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Home Filter */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          {t('common.filterByHome')}
        </span>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={selectedHomeId === null ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedHomeId(null)}
            className="text-xs"
          >
            {t('common.allHomes')}
          </Button>
          {homeList.map((home) => (
            <Button
              key={home.id}
              variant={selectedHomeId === home.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedHomeId(home.id)}
              className="text-xs flex items-center gap-1"
            >
              <Home className="w-3 h-3" />
              {home.name}
            </Button>
          ))}
        </div>
      </div>

      {/* Error State */}
      {error && (
        <Card className="bg-destructive/10 border-destructive/30">
          <CardContent className="p-4 text-center">
            <p className="text-destructive">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchSchedules(true)}
              className="mt-2"
            >
              {t('common.tryAgain')}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {isLoading && schedules.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
          <span className="text-muted-foreground">
            {t('schedules.loading')}
          </span>
        </div>
      )}

      {/* Schedules Grid */}
      {!isLoading && filteredSchedules.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredSchedules.map((schedule) => (
            <ScheduleCard
              key={schedule.id}
              schedule={schedule}
              onToggle={toggleSchedule}
              onDelete={deleteSchedule}
              onEdit={(id) => navigate(`/schedules/edit/${id}`)}
            />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && filteredSchedules.length === 0 && (
        <Card className="bg-card/40 border-border">
          <CardContent className="py-16 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              <CalendarClock className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">
              {t('schedules.empty.title')}
            </h3>
            <p className="text-muted-foreground text-sm mb-4">
              {selectedHomeId
                ? t('schedules.empty.forHome', {
                    home: homeList.find((h) => h.id === selectedHomeId)?.name,
                  })
                : t('schedules.empty.cta')}
            </p>
            <Button onClick={() => navigate('/schedules/new')}>
              <Plus className="w-4 h-4 mr-2" />
              {t('schedules.create')}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
