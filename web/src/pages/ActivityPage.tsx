import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '../components/ui/card';
import { Activity } from 'lucide-react';
import { useActivityStore } from '../store/useActivityStore';

export default function ActivityPage() {
  const { events } = useActivityStore();

  return (
    <div className="container max-w-4xl mx-auto space-y-8 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">
            Activity
          </h2>
          <p className="text-muted-foreground">
            Live stream of system events and notifications
          </p>
        </div>
        <div className="p-3 bg-primary/10 rounded-full">
          <Activity className="h-8 w-8 text-primary" />
        </div>
      </div>

      <Card className="bg-card/40 border-border h-[calc(100vh-250px)] flex flex-col">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Live Events
          </CardTitle>
          <CardDescription>Showing last {events.length} events</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden">
          {events.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8 border border-dashed border-border/50 rounded-lg">
              <Activity className="h-12 w-12 mb-4 opacity-20" />
              <p>No recent events</p>
              <p className="text-xs opacity-70 mt-1">
                Waiting for system activity...
              </p>
            </div>
          ) : (
            <div className="h-full overflow-y-auto space-y-4 pr-2 custom-scrollbar">
              {events.map((event) => (
                <div
                  key={event.id}
                  className="p-4 rounded-lg bg-background/50 border border-border/50 hover:bg-accent/20 transition-colors animate-in fade-in slide-in-from-top-2 duration-300"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-primary/20 text-primary border border-primary/20">
                      {event.topic}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {event.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                  <pre className="text-xs font-mono text-muted-foreground bg-background/80 p-3 rounded border border-border/30 overflow-x-auto">
                    {event.payload}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
