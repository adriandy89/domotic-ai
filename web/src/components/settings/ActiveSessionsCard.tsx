import { Monitor } from 'lucide-react';
import { useEffect, useState } from 'react';
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
          Active Sessions
        </CardTitle>
        <CardDescription>
          You have {activeSessionsCount} other active session
          {activeSessionsCount > 1 ? 's' : ''} on other browser.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          variant="destructive"
          disabled={loading}
          onClick={() => setIsConfirmOpen(true)}
        >
          Log out other browser
        </Button>

        <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
          <DialogContent onClose={() => setIsConfirmOpen(false)}>
            <DialogHeader>
              <DialogTitle>Are you active on other browser?</DialogTitle>
              <DialogDescription>
                This action will log out all other browser logged into your
                account. You will remain logged in on this browser.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsConfirmOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleRevokeSessions}
                variant="destructive"
                disabled={loading}
              >
                {loading ? 'Logging out...' : 'Log out others'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
