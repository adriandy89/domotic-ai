import { Bell } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useAuthStore } from '../../store/useAuthStore';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../ui/card';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';

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

export default function NotificationsCard() {
  const { user, checkSession, updateUser } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        const newAttributes = response.data.data.attributes;
        if (user) {
          updateUser({ attributes: newAttributes });
        }
      }
    } catch (err) {
      console.error(err);
      setError('Error updating user attributes');
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
    <Card className="bg-card/40 border-border">
      <CardHeader className="flex flex-row items-center space-x-2 pb-3">
        <div className="p-3 bg-primary/10 rounded-full">
          <Bell className="h-8 w-8 text-primary" />
        </div>
        <div>
          <CardTitle className="text-xl">Notifications</CardTitle>
          <CardDescription>
            Configure which global sensor events trigger notifications.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
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
        {error && (
          <p className="text-red-500 text-sm text-center bg-red-500/10 p-2 rounded">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
