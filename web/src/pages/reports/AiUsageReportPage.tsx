import { useEffect, useState } from 'react';
import {
  BarChartCmp,
  KPICard,
  presetRange,
  RangeSelector,
  TimeSeriesChart,
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
  type AiUsageReport,
} from '../../store/useReportsStore';
import { Bot, Clock, MessageSquare, Wrench } from 'lucide-react';
import { formatNumber } from '../../lib/format';

export default function AiUsageReportPage() {
  const { fetchAiUsage } = useReportsStore();
  const [range, setRange] = useState<RangeValue>(presetRange('30d'));
  const [report, setReport] = useState<AiUsageReport | null>(null);

  useEffect(() => {
    fetchAiUsage({ from: range.from, to: range.to }).then(setReport);
  }, [range, fetchAiUsage]);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <RangeSelector value={range} onChange={setRange} />
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KPICard
          label="Total tokens"
          value={formatNumber(report?.totals.total_tokens, 0)}
          subtitle={`${formatNumber(report?.totals.prompt_tokens, 0)} prompt · ${formatNumber(report?.totals.completion_tokens, 0)} completion`}
          accentColor="#8b5cf6"
          icon={<Bot className="w-4 h-4" />}
        />
        <KPICard
          label="Conversations"
          value={String(report?.totals.conversations ?? 0)}
          accentColor="#22d3ee"
          icon={<MessageSquare className="w-4 h-4" />}
        />
        <KPICard
          label="Tool calls"
          value={formatNumber(report?.totals.tool_calls, 0)}
          accentColor="#10b981"
          icon={<Wrench className="w-4 h-4" />}
        />
        <KPICard
          label="Latency p95"
          value={`${formatNumber(report?.totals.p95_latency_ms, 0)} ms`}
          subtitle={`avg ${formatNumber(report?.totals.avg_latency_ms, 0)} ms`}
          accentColor="#f59e0b"
          inverse
          icon={<Clock className="w-4 h-4" />}
        />
      </div>

      <Card className="bg-card/40 border-border">
        <CardHeader>
          <CardTitle className="text-lg">Tokens per day</CardTitle>
        </CardHeader>
        <CardContent>
          <TimeSeriesChart
            data={(report?.daily ?? []).map((d) => ({
              bucket: d.day,
              tokens: d.total_tokens,
              calls: d.calls,
            }))}
            series={[
              { key: 'tokens', label: 'Tokens', color: '#8b5cf6' },
              { key: 'calls', label: 'Calls', color: '#22d3ee' },
            ]}
            type="area"
            height={260}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Card className="bg-card/40 border-border">
          <CardHeader>
            <CardTitle className="text-lg">By provider</CardTitle>
          </CardHeader>
          <CardContent>
            {(report?.by_provider ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No AI usage yet.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b border-border/50">
                  <tr>
                    <th className="text-left py-2 px-2">Provider</th>
                    <th className="text-right py-2 px-2">Tokens</th>
                    <th className="text-right py-2 px-2">Calls</th>
                    <th className="text-right py-2 px-2">Avg latency</th>
                  </tr>
                </thead>
                <tbody>
                  {report!.by_provider.map((p) => (
                    <tr
                      key={p.provider}
                      className="border-b border-border/30 hover:bg-accent/20"
                    >
                      <td className="py-2 px-2 capitalize">{p.provider}</td>
                      <td className="py-2 px-2 text-right tabular-nums">
                        {formatNumber(p.total_tokens, 0)}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">
                        {p.calls}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">
                        {p.avg_latency_ms} ms
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/40 border-border">
          <CardHeader>
            <CardTitle className="text-lg">Top models</CardTitle>
          </CardHeader>
          <CardContent>
            {(report?.by_model ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No AI usage yet.
              </p>
            ) : (
              <BarChartCmp
                data={(report?.by_model ?? []).map((m) => ({
                  name: m.model,
                  tokens: m.total_tokens,
                }))}
                xKey="name"
                series={[
                  { key: 'tokens', label: 'Tokens', color: '#8b5cf6' },
                ]}
                layout="vertical"
                height={Math.max(180, (report?.by_model.length ?? 0) * 32)}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {report && report.totals.errors > 0 && (
        <Card className="bg-destructive/10 border-destructive/30">
          <CardContent className="p-4 text-sm">
            <strong>{report.totals.errors}</strong> AI calls failed during this
            period. Check the logs of the ai-service for details.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
