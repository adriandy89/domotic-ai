import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Activity, Thermometer, Zap, Wifi } from 'lucide-react';

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">
            Dashboard
          </h2>
          <p className="text-muted-foreground">
            Overview of your smart home system.
          </p>
        </div>
        <Button variant="premium">Add Device</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[
          {
            title: 'Energy Usage',
            icon: Zap,
            value: '2.4 kWh',
            color: 'text-amber-400',
          },
          {
            title: 'Temperature',
            icon: Thermometer,
            value: '24°C',
            color: 'text-rose-400',
          },
          {
            title: 'Active Devices',
            icon: Activity,
            value: '12',
            color: 'text-emerald-400',
          },
          {
            title: 'System Status',
            icon: Wifi,
            value: 'Online',
            color: 'text-cyan-400',
          },
        ].map((item, i) => (
          <Card key={i} className="bg-card/40 border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {item.title}
              </CardTitle>
              <item.icon className={`h-4 w-4 ${item.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-card-foreground">
                {item.value}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                +2% from last hour
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4 bg-card/40 border-border">
          <CardHeader>
            <CardTitle className="text-xl text-foreground">
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[1, 2, 3].map((_, i) => (
                <div key={i} className="flex items-center">
                  <div className="w-2 h-2 rounded-full bg-primary mr-4" />
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      Living Room Light turned on
                    </p>
                    <p className="text-xs text-muted-foreground">
                      2 minutes ago
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card className="col-span-3 bg-card/40 border-border">
          <CardHeader>
            <CardTitle className="text-xl text-foreground">
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            <Button variant="secondary" className="justify-start">
              Turn all lights off
            </Button>
            <Button variant="secondary" className="justify-start">
              Activate Night Mode
            </Button>
            <Button variant="secondary" className="justify-start">
              Lock all doors
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
