import { useEffect, useState } from 'react';
import {
  BarChartCmp,
  KPICard,
  presetRange,
  RangeSelector,
  type RangeValue,
} from '../../components/charts';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import {
  useReportsStore,
  type AutomationsReport,
} from '../../store/useReportsStore';
import { CalendarClock, CheckCircle2, XCircle, Zap } from 'lucide-react';

export default function AutomationsReportPage() {
  const { fetchAutomations } = useReportsStore();
  const [range, setRange] = useState<RangeValue>(presetRange('30d'));
  const [report, setReport] = useState<AutomationsReport | null>(null);

  useEffect(() => {
    fetchAutomations({ from: range.from, to: range.to }).then(setReport);
  }, [range, fetchAutomations]);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <RangeSelector value={range} onChange={setRange} />
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KPICard
          label="Rule executions"
          value={String(report?.totals.rule_executions ?? 0)}
          accentColor="#8b5cf6"
          icon={<CalendarClock className="w-4 h-4" />}
        />
        <KPICard
          label="Rule errors"
          value={String(report?.totals.rule_executions_failed ?? 0)}
          accentColor="#ef4444"
          inverse
          icon={<XCircle className="w-4 h-4" />}
        />
        <KPICard
          label="Commands sent"
          value={String(report?.totals.commands_total ?? 0)}
          accentColor="#22d3ee"
          icon={<Zap className="w-4 h-4" />}
        />
        <KPICard
          label="Command failures"
          value={String(report?.totals.commands_failed ?? 0)}
          accentColor="#f59e0b"
          inverse
          icon={<CheckCircle2 className="w-4 h-4" />}
        />
      </div>

      <Card className="bg-card/40 border-border">
        <CardHeader>
          <CardTitle className="text-lg">Rule firings per day</CardTitle>
        </CardHeader>
        <CardContent>
          <BarChartCmp
            data={(report?.rule_executions_daily ?? []).map((r) => ({
              day: r.day,
              triggered: r.conditions_met,
              executed: r.executed,
            }))}
            xKey="day"
            series={[
              { key: 'triggered', label: 'Conditions met', color: '#8b5cf6' },
              { key: 'executed', label: 'Executed', color: '#10b981' },
            ]}
            xFormat={(v) => new Date(v).toLocaleDateString()}
            stacked={false}
          />
        </CardContent>
      </Card>

      <Card className="bg-card/40 border-border">
        <CardHeader>
          <CardTitle className="text-lg">Commands by source</CardTitle>
        </CardHeader>
        <CardContent>
          <BarChartCmp
            data={(report?.commands_by_source_daily ?? []).map((r) => ({
              day: r.day,
              api: r.api,
              ai: r.ai,
              rule: r.rule,
              schedule: r.schedule,
            }))}
            xKey="day"
            series={[
              { key: 'api', label: 'API', color: '#22d3ee' },
              { key: 'ai', label: 'AI', color: '#8b5cf6' },
              { key: 'rule', label: 'Rule', color: '#10b981' },
              { key: 'schedule', label: 'Schedule', color: '#f59e0b' },
            ]}
            xFormat={(v) => new Date(v).toLocaleDateString()}
            stacked
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Card className="bg-card/40 border-border">
          <CardHeader>
            <CardTitle className="text-lg">Top rules</CardTitle>
          </CardHeader>
          <CardContent>
            {(report?.rule_top ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No rule executions yet.
              </p>
            ) : (
              <BarChartCmp
                data={(report?.rule_top ?? []).map((r) => ({
                  name: r.name,
                  executions: r.executions,
                }))}
                xKey="name"
                series={[
                  {
                    key: 'executions',
                    label: 'Executions',
                    color: '#8b5cf6',
                  },
                ]}
                layout="vertical"
                height={Math.max(180, (report?.rule_top.length ?? 0) * 32)}
              />
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/40 border-border">
          <CardHeader>
            <CardTitle className="text-lg">Most commanded devices</CardTitle>
          </CardHeader>
          <CardContent>
            {(report?.commands_top_devices ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No commands sent yet.
              </p>
            ) : (
              <BarChartCmp
                data={(report?.commands_top_devices ?? []).map((r) => ({
                  name: r.name,
                  commands: r.commands,
                }))}
                xKey="name"
                series={[
                  { key: 'commands', label: 'Commands', color: '#22d3ee' },
                ]}
                layout="vertical"
                height={Math.max(
                  180,
                  (report?.commands_top_devices.length ?? 0) * 32,
                )}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
