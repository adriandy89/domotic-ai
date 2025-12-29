import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../components/ui/card';
import { useHomesStore } from '../store/useHomesStore';
import { Wifi, WifiOff, Home as HomeIcon } from 'lucide-react';
import { Badge } from '../components/ui/badge';
import { useDevicesStore } from '../store/useDevicesStore';

export default function HomesPage() {
  const navigate = useNavigate();
  const { homes, homeIds, isLoading } = useHomesStore();
  const { getDevicesByHomeId } = useDevicesStore();

  // Data is already fetched on auth - no need to refetch on page navigation

  if (isLoading && homeIds.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Homes</h1>
      </div>

      {homeIds.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No homes found. Add a home in the Access page.
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {homeIds.map((id) => {
            const home = homes[id];
            const deviceCount = getDevicesByHomeId(id).length;

            return (
              <Card
                key={id}
                className="cursor-pointer hover:border-primary/50 transition-colors overflow-hidden group"
                onClick={() => navigate(`/homes/${id}`)}
              >
                <div className="relative aspect-video bg-muted">
                  {home.image ? (
                    <img
                      src={home.image}
                      alt={home.name}
                      className="object-cover w-full h-full transition-transform group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex items-center justify-center w-full h-full bg-accent/20">
                      <HomeIcon className="w-16 h-16 text-muted-foreground/30" />
                    </div>
                  )}
                  <div className="absolute top-2 right-2 bg-muted rounded-lg">
                    <Badge
                      variant={home.connected ? 'success' : 'destructive'}
                      className="flex items-center gap-1 shadow-sm"
                    >
                      {home.connected ? (
                        <>
                          <Wifi className="w-3 h-3" />
                          <span className="text-xs">Online</span>
                        </>
                      ) : (
                        <>
                          <WifiOff className="w-3 h-3" />
                          <span className="text-xs">Offline</span>
                        </>
                      )}
                    </Badge>
                  </div>
                </div>
                <CardContent className="p-4">
                  <h3 className="font-semibold text-lg truncate mb-1 text-foreground">
                    {home.name}
                  </h3>
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-3 h-10">
                    {home.description || 'No description'}
                  </p>
                  <div className="flex items-center text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded w-fit">
                    {deviceCount} device{deviceCount !== 1 ? 's' : ''}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
