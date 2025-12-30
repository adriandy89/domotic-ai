import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { api } from '../lib/api';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Separator } from '../components/ui/separator';
import { Monitor, User } from 'lucide-react';
import { Button } from '../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';

// Define the attribute keys matching the old example
type UserAttr =
  | 'contactTrue'
  | 'contactFalse'
  | 'vibrationTrue'
  | 'occupancyTrue'
  | 'presenceTrue'
  | 'smokeTrue'
  | 'waterLeakTrue';

const ATTRIBUTE_LABELS: Record<UserAttr, string> = {
  contactTrue: 'Contact Sensor (Closed)',
  contactFalse: 'Contact Sensor (Open)',
  vibrationTrue: 'Vibration Detected',
  occupancyTrue: 'Occupancy Detected',
  presenceTrue: 'Presence Detected',
  smokeTrue: 'Smoke Detected',
  waterLeakTrue: 'Water Leak Detected',
};

export default function SettingsPage() {
  const { user, checkSession, updateUser } = useAuthStore();

  const [loading, setLoading] = useState<boolean>(false);
  const [activeSessionsCount, setActiveSessionsCount] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [userAttributes, setUserAttributes] = useState<
    Record<UserAttr, boolean>
  >({
    contactTrue: false,
    contactFalse: false,
    vibrationTrue: false,
    occupancyTrue: false,
    presenceTrue: false,
    smokeTrue: false,
    waterLeakTrue: false,
  });

  useEffect(() => {
    fetchActiveSessions();
  }, []);

  const fetchActiveSessions = async () => {
    try {
      const response = await api.get('/users/sessions/active');
      if (response.data?.ok) {
        setActiveSessionsCount(response.data.count);
      }
    } catch (error) {
      console.error('Failed to fetch active sessions', error);
    }
  };

  const handleRevokeSessions = async () => {
    try {
      setLoading(true);
      await api.delete('/users/sessions/others');
      await fetchActiveSessions();
      setIsConfirmOpen(false);
    } catch (error) {
      console.error('Failed to revoke sessions', error);
      setError('Failed to log out other devices');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.attributes) {
      setUserAttributes({
        contactTrue: user.attributes.contactTrue ?? false,
        contactFalse: user.attributes?.contactFalse ?? false,
        vibrationTrue: user.attributes?.vibrationTrue ?? false,
        occupancyTrue: user.attributes?.occupancyTrue ?? false,
        presenceTrue: user.attributes?.presenceTrue ?? false,
        smokeTrue: user.attributes?.smokeTrue ?? false,
        waterLeakTrue: user.attributes?.waterLeakTrue ?? false,
      });
    }
  }, [user]);

  const handleUpdateAttribute = async (
    attributes: Record<UserAttr, boolean>,
  ) => {
    try {
      setError(null);
      setLoading(true);

      const response = await api.put('/users/attributes', {
        attributes,
      });

      if (response.data?.ok && response.data?.data?.attributes) {
        // Update local store with the new attributes from response
        const newAttributes = response.data.data.attributes;
        if (user) {
          updateUser({ attributes: newAttributes });
        }
      }
    } catch (err) {
      console.error(err);
      setError('Error updating user attributes');
      // Revert changes if needed, but for now we just show error
      // In a real app we might revert the switch or refetch
      await checkSession(); // Refetch to reset state
    } finally {
      setLoading(false);
    }
  };

  const toggleAttribute = (attr: UserAttr) => {
    const updatedAttributes = {
      ...userAttributes,
      [attr]: !userAttributes[attr],
    };
    setUserAttributes(updatedAttributes);
    handleUpdateAttribute(updatedAttributes);
  };

  return (
    <div className="container max-w-4xl mx-auto space-y-3 py-1">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">
            Settings
          </h2>
          <p className="text-muted-foreground">
            Manage your profile and preferences
          </p>
        </div>
      </div>

      <Separator />

      <Card className="bg-card/40 border-border">
        <CardHeader className="flex flex-row items-center space-x-2 pb-3">
          <div className="p-2 bg-primary/10 rounded-full">
            <User className="h-8 w-8 text-primary" />
          </div>
          <div>
            <CardTitle className="text-xl">{user?.name}</CardTitle>
            <CardDescription className="flex items-center gap-2 mt-1">
              <span>{user?.email}</span>
              {user?.phone && (
                <>
                  <span>•</span>
                  <span>+{user.phone}</span>
                </>
              )}
            </CardDescription>
          </div>
        </CardHeader>
        <Separator className="bg-border/50" />
        <CardContent className="space-y-2 pt-2">
          <div className="space-y-4">
            <div className="flex flex-col space-y-1">
              <h3 className="text-lg font-medium">Notifications</h3>
              <p className="text-sm text-muted-foreground">
                Configure which global sensor events trigger notifications.
              </p>
            </div>

            <div className="grid gap-1">
              {Object.entries(userAttributes).map(([key, value]) => (
                <div
                  key={key}
                  className="flex items-center justify-between p-4 rounded-lg border border-border/50 bg-background/50 hover:bg-accent/40 transition-colors"
                >
                  <Label
                    htmlFor={key}
                    className="flex-1 cursor-pointer font-medium"
                  >
                    {ATTRIBUTE_LABELS[key as UserAttr]}
                  </Label>
                  <Switch
                    id={key}
                    checked={value}
                    onCheckedChange={() => toggleAttribute(key as UserAttr)}
                    disabled={loading}
                  />
                </div>
              ))}
            </div>
          </div>
          {error && (
            <p className="text-red-500 text-sm text-center bg-red-500/10 p-2 rounded">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      {activeSessionsCount > 0 && (
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
                  <Button
                    variant="outline"
                    onClick={() => setIsConfirmOpen(false)}
                  >
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
      )}
    </div>
  );
}
