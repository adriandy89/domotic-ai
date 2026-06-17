import { Monitor } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { Button } from '../ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

export default function ActiveSessionsCard() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [activeSessionsCount, setActiveSessionsCount] = useState(0);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const fetchActiveSessions = async () => {
    try {
      const response = await api.get('/users/sessions/active');
      if (response.data?.ok) {
        setActiveSessionsCount(response.data.count);
      }
    } catch (error: any) {
      console.error('Failed to fetch active sessions', error);
    }
  };

  useEffect(() => {
    fetchActiveSessions();
  }, []);

  const handleRevokeSessions = async () => {
    try {
      setLoading(true);
      await api.delete('/users/sessions/others');
      await fetchActiveSessions();
      setIsConfirmOpen(false);
    } catch (error: any) {
      console.error('Failed to revoke sessions', error);
    } finally {
      setLoading(false);
    }
  };

  if (activeSessionsCount === 0) return null;

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-1 text-destructive">
          <Monitor className="h-5 w-5" />
          {t('settings.sessions.title')}
        </CardTitle>
        <CardDescription>
          {t('settings.sessions.description', { count: activeSessionsCount })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          variant="destructive"
          disabled={loading}
          onClick={() => setIsConfirmOpen(true)}
        >
          {t('settings.sessions.logout')}
        </Button>

        <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
          <DialogContent onClose={() => setIsConfirmOpen(false)}>
            <DialogHeader>
              <DialogTitle>{t('settings.sessions.confirmTitle')}</DialogTitle>
              <DialogDescription>
                {t('settings.sessions.confirmDesc')}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsConfirmOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                onClick={handleRevokeSessions}
                variant="destructive"
                disabled={loading}
              >
                {loading
                  ? t('settings.sessions.loggingOut')
                  : t('settings.sessions.logoutOthers')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
