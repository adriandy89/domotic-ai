import { useParams, useNavigate } from 'react-router-dom';
import { useHomesStore } from '../store/useHomesStore';
import { HomeMap } from '../components/map/HomeMap';
import { Button } from '../components/ui/button';
import { ArrowLeft, Loader2 } from 'lucide-react';

export default function HomeMapPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { homes, isLoading: isLoadingHomes } = useHomesStore();

  // Data is already fetched on auth, SSE handles real-time updates
  // No need to refetch on page navigation

  const home = id ? homes[id] : undefined;

  if (isLoadingHomes && !home) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!home) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <h2 className="text-xl font-semibold">Home not found</h2>
        <Button onClick={() => navigate('/homes')}>Go Back to Homes</Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col p-2 md:p-4 gap-2">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate('/homes')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">
            {home.name}
          </h1>
          {home.description && (
            <p className="text-muted-foreground text-xs">{home.description}</p>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        <HomeMap home={home} />
      </div>
    </div>
  );
}
