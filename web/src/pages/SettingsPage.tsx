import { Bot, Monitor, User } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Separator } from '../components/ui/separator';
import { Switch } from '../components/ui/switch';
import { api } from '../lib/api';
import { useAuthStore } from '../store/useAuthStore';

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

interface AiConfig {
  provider: string;
  model: string;
  apiKey?: string;
  enabled: boolean;
}

export default function SettingsPage() {
  const { user, checkSession, updateUser } = useAuthStore();

  const [loading, setLoading] = useState<boolean>(false);
  const [activeSessionsCount, setActiveSessionsCount] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [aiConfig, setAiConfig] = useState<AiConfig | null>(null);
  const [isAiConfigOpen, setIsAiConfigOpen] = useState(false);
  const [editingAiConfig, setEditingAiConfig] = useState<AiConfig>({
    provider: 'openai',
    model: 'gpt-4o',
    apiKey: '',
    enabled: true,
  });

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
    if (user?.role === 'ADMIN') {
      fetchAiConfig();
    }
  }, [user]);

  const fetchAiConfig = async () => {
    try {
      const response = await api.get('/users/org/attributes/ai');
      if (response.data?.ai) {
        const configData = response.data.ai;

        setAiConfig(configData);
        setEditingAiConfig({
          ...configData,
          apiKey: '', // Clear API key for security when editing
        });
      }
    } catch (error) {
      console.error('Failed to fetch AI config', error);
    }
  };

  const handleUpdateAiConfig = async () => {
    try {
      setLoading(true);

      const payload = { ...editingAiConfig };
      // If apiKey is empty, use the existing one
      if (!payload.apiKey && aiConfig?.apiKey) {
        payload.apiKey = aiConfig.apiKey;
      }

      await api.put('/users/org/attributes/ai', payload);
      await fetchAiConfig();
      setIsAiConfigOpen(false);
    } catch (error) {
      console.error('Failed to update AI config', error);
      setError('Failed to update AI configuration');
    } finally {
      setLoading(false);
    }
  };

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
          <div className="p-3 bg-primary/10 rounded-full">
            <User className="h-8 w-8 text-primary" />
          </div>
          <div>
            <CardTitle className="text-xl">{user?.name}</CardTitle>
            <CardDescription className="flex md:flex-row flex-col md:gap-2">
              <span>{user?.email}</span>
              {user?.phone && <span>+{user.phone}</span>}
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

      {/* HERE */}

      {user?.role === 'ADMIN' && (
        <Card className="bg-card/40 border-border">
          <CardHeader className="flex flex-row items-center space-x-2 pb-3">
            <div className="p-3 bg-primary/10 rounded-full">
              <Bot className="h-8 w-8 text-primary" />
            </div>
            <div>
              <CardTitle className="text-xl">AI Configuration</CardTitle>
              <CardDescription>
                Configure the AI provider for your organization.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {aiConfig ? (
              <div className="flex items-center justify-between p-4 rounded-lg border border-border/50 bg-background/50">
                <div className="space-y-1">
                  <p className="font-medium capitalize">
                    {aiConfig.provider} - {aiConfig.model}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    API Key:{' '}
                    {aiConfig.apiKey
                      ? `${aiConfig.apiKey.substring(0, 3)}...${aiConfig.apiKey.substring(aiConfig.apiKey.length - 4)}`
                      : 'Not set'}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={`h-2 w-2 rounded-full ${aiConfig.enabled ? 'bg-green-500' : 'bg-red-500'}`}
                    />
                    <span className="text-xs text-muted-foreground">
                      {aiConfig.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setIsAiConfigOpen(true)}
                >
                  Edit
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-6 border border-dashed border-border rounded-lg">
                <p className="text-muted-foreground mb-4">
                  No AI configuration found
                </p>
                <Button onClick={() => setIsAiConfigOpen(true)}>
                  Configure AI
                </Button>
              </div>
            )}

            <Dialog open={isAiConfigOpen} onOpenChange={setIsAiConfigOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>AI Configuration</DialogTitle>
                  <DialogDescription>
                    Set up your AI provider settings. API Key is required.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="provider">Provider</Label>
                    <Select
                      value={editingAiConfig.provider}
                      onValueChange={(value) =>
                        setEditingAiConfig({
                          ...editingAiConfig,
                          provider: value,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select provider" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="openai">OpenAI</SelectItem>
                        <SelectItem value="anthropic">Anthropic</SelectItem>
                        <SelectItem value="google">Google</SelectItem>
                        <SelectItem value="groq">Groq</SelectItem>
                        <SelectItem value="mistral">Mistral</SelectItem>
                        <SelectItem value="xai">xAI</SelectItem>
                        <SelectItem value="azure">Azure</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="model">Model</Label>
                    <Input
                      id="model"
                      value={editingAiConfig.model}
                      onChange={(e) =>
                        setEditingAiConfig({
                          ...editingAiConfig,
                          model: e.target.value,
                        })
                      }
                      placeholder="e.g. gpt-4o, claude-3-5-sonnet"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="apiKey">API Key</Label>
                    <Input
                      id="apiKey"
                      type="password"
                      value={editingAiConfig.apiKey || ''}
                      onChange={(e) =>
                        setEditingAiConfig({
                          ...editingAiConfig,
                          apiKey: e.target.value,
                        })
                      }
                      placeholder="sk-..."
                    />
                    <p className="text-xs text-muted-foreground">
                      Leave empty to keep existing key if editing.
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="ai-enabled">Enable AI Assistant</Label>
                    <Switch
                      id="ai-enabled"
                      checked={editingAiConfig.enabled}
                      onCheckedChange={(checked) =>
                        setEditingAiConfig({
                          ...editingAiConfig,
                          enabled: checked,
                        })
                      }
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setIsAiConfigOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleUpdateAiConfig} disabled={loading}>
                    {loading ? 'Saving...' : 'Save Configuration'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      )}

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
