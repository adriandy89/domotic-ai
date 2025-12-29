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
    <div className="flex h-full flex-col p-4 md:p-6 gap-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/homes')}>
          <ArrowLeft className="h-6 w-6" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{home.name} Map</h1>
          <p className="text-muted-foreground text-sm">{home.description}</p>
        </div>
      </div>

      <div className="flex-1 min-h-0 bg-background rounded-xl border shadow-sm overflow-hidden flex flex-col p-4">
        <HomeMap home={home} />
      </div>
    </div>
  );
}
