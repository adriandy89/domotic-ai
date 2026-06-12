import { Bell, Plug, User, Zap } from 'lucide-react';
import { useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import ActiveSessionsCard from '../components/settings/ActiveSessionsCard';
import AiConfigCard from '../components/settings/AiConfigCard';
import MarketProvidersSection from '../components/settings/energy/MarketProvidersSection';
import TariffSection from '../components/settings/energy/TariffSection';
import McpEndpointCard from '../components/settings/McpEndpointCard';
import NotificationsCard from '../components/settings/NotificationsCard';
import ProfileCard from '../components/settings/ProfileCard';
import XiaozhiIntegrationCard from '../components/settings/XiaozhiIntegrationCard';
import { Separator } from '../components/ui/separator';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../components/ui/tabs';
import { useAuthStore } from '../store/useAuthStore';

const TABS = ['general', 'notifications', 'integrations', 'energy'] as const;
type SettingsTab = (typeof TABS)[number];

export default function SettingsPage() {
  const { user } = useAuthStore();
  // The URL is the single source of truth so /settings?tab=energy deep-links.
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get('tab');
  const tab: SettingsTab = (TABS as readonly string[]).includes(raw ?? '')
    ? (raw as SettingsTab)
    : 'general';

  const providersRef = useRef<HTMLDivElement>(null);

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

      <Tabs
        value={tab}
        onValueChange={(value) =>
          setSearchParams({ tab: value }, { replace: true })
        }
      >
        <TabsList className="bg-muted/50 w-full sm:w-auto overflow-x-auto justify-start">
          <TabsTrigger value="general" className="gap-2">
            <User className="h-4 w-4" />
            General
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2">
            <Bell className="h-4 w-4" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="integrations" className="gap-2">
            <Plug className="h-4 w-4" />
            Integrations
          </TabsTrigger>
          <TabsTrigger value="energy" className="gap-2">
            <Zap className="h-4 w-4" />
            Energy
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-3">
          <ProfileCard />
          <ActiveSessionsCard />
        </TabsContent>

        <TabsContent value="notifications" className="space-y-3">
          <NotificationsCard />
        </TabsContent>

        <TabsContent value="integrations" className="space-y-3">
          <McpEndpointCard />
          <XiaozhiIntegrationCard />
          {user?.role === 'ADMIN' && <AiConfigCard />}
        </TabsContent>

        <TabsContent value="energy" className="space-y-3">
          <TariffSection
            onConfigureProviders={() =>
              providersRef.current?.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
              })
            }
          />
          <MarketProvidersSection ref={providersRef} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
