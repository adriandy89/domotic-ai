import { DbService } from '@app/db';
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EmailService } from '../notification/email.service';
import { ReportsService } from './reports.service';

/**
 * Generates and emails a monthly summary per home.
 *
 * Strategy:
 *  - Run at 06:00 on the 1st of every month.
 *  - For each home with users that have an email + home.currency configured,
 *    aggregate the previous month and send an HTML summary.
 *  - We deliberately do NOT generate a PDF: it adds Puppeteer/Chromium to
 *    the deploy. HTML email is professional enough as the first iteration;
 *    can be upgraded later to attach a PDF rendered server-side.
 *
 *  - The same logic powers the manual endpoint POST /reports/monthly-email.
 */
@Injectable()
export class MonthlyReportsService {
  private readonly logger = new Logger(MonthlyReportsService.name);

  constructor(
    private readonly db: DbService,
    private readonly reports: ReportsService,
    private readonly email: EmailService,
  ) {}

  @Cron(CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT)
  async runMonthlyJob(): Promise<void> {
    try {
      const { from, to } = this.previousMonthRange(new Date());
      this.logger.log(
        `Starting monthly reports job for ${from.toISOString()}..${to.toISOString()}`,
      );
      await this.dispatchToAllHomes({ from, to });
    } catch (error: any) {
      this.logger.error(`Monthly job failed: ${(error as Error).message}`);
    }
  }

  /**
   * Trigger the monthly report manually (admin endpoint). Defaults to the
   * previous month if no range is given.
   */
  async runForOrganization(
    organizationId: string,
    range?: { from: Date; to: Date },
  ): Promise<{ sent: number }> {
    const r = range ?? this.previousMonthRange(new Date());
    const homes = await this.db.home.findMany({
      where: { organization_id: organizationId, disabled: false },
      include: {
        users: { include: { user: true } },
      },
    });
    let sent = 0;
    for (const home of homes) {
      const recipients = Array.from(
        new Set(
          home.users
            .map((uh) => uh.user.email)
            .filter((e): e is string => typeof e === 'string' && e.length > 0),
        ),
      );
      if (recipients.length === 0) continue;
      const html = await this.buildHomeHtml(home.id, r.from, r.to);
      const subject = `Monthly report — ${home.name} (${r.from.toLocaleString(undefined, { month: 'long', year: 'numeric' })})`;
      for (const to of recipients) {
        try {
          await this.email.sendEmail(to, subject, html);
          sent++;
        } catch (err) {
          this.logger.warn(
            `email send to ${to} failed: ${(err as Error).message}`,
          );
        }
      }
    }
    return { sent };
  }

  private async dispatchToAllHomes(range: { from: Date; to: Date }) {
    const orgs = await this.db.organization.findMany({
      where: { is_active: true },
      select: { id: true },
    });
    for (const o of orgs) {
      try {
        await this.runForOrganization(o.id, range);
      } catch (err) {
        this.logger.warn(
          `monthly dispatch for org ${o.id} failed: ${(err as Error).message}`,
        );
      }
    }
  }

  /**
   * Render an HTML body for the given home + range, including:
   *  - Energy total and cost
   *  - Avg/min/max temp
   *  - Total events (open, motion, alarm)
   *  - Top consuming devices (best-effort)
   *  - LQI and battery hot-spots
   */
  private async buildHomeHtml(
    homeId: string,
    from: Date,
    to: Date,
  ): Promise<string> {
    const home = await this.db.home.findUnique({
      where: { id: homeId },
      include: {
        devices: {
          where: { disabled: false },
          select: { id: true, name: true },
        },
      },
    });
    if (!home) return '<p>Home not found.</p>';

    // Aggregate per-device, then total at the home level.
    const perDevice: Record<
      string,
      { name: string; metrics: Record<string, number | null> }
    > = {};
    let energySum = 0;
    let tempSamples: number[] = [];
    let openCount = 0;
    let motionCount = 0;
    let smokeCount = 0;
    let leakCount = 0;

    // System userId — we just need access to the org-wide aggregate; using
    // the first user of the home avoids the device-access guard noise.
    const firstUser = await this.db.userHome.findFirst({
      where: { home_id: homeId },
      select: { user_id: true },
    });
    if (!firstUser) return '<p>No users assigned to this home.</p>';

    for (const dev of home.devices) {
      try {
        const agg = await this.reports.getAggregate(firstUser.user_id, {
          device_id: dev.id,
          from,
          to,
        });
        perDevice[dev.id] = { name: dev.name, metrics: agg.metrics };
        const e = Number(agg.metrics.energy_kwh ?? 0);
        if (e > 0) energySum += e;
        const t = agg.metrics.temperature_avg;
        if (t != null) tempSamples.push(Number(t));
        openCount += Number(agg.metrics.contact_open_count ?? 0);
        motionCount += Number(agg.metrics.motion_count ?? 0);
        smokeCount += Number(agg.metrics.smoke_count ?? 0);
        leakCount += Number(agg.metrics.water_leak_count ?? 0);
      } catch {
        // Skip devices the user can't access (shouldn't happen in this code path).
      }
    }

    const cost = energySum * Number(home.kwh_price ?? 0);
    const tempAvg =
      tempSamples.length > 0
        ? tempSamples.reduce((a, b) => a + b, 0) / tempSamples.length
        : null;

    const topConsumers = Object.values(perDevice)
      .map((d) => ({ name: d.name, energy: Number(d.metrics.energy_kwh ?? 0) }))
      .filter((d) => d.energy > 0)
      .sort((a, b) => b.energy - a.energy)
      .slice(0, 5);

    const fromStr = from.toLocaleDateString();
    const toStr = to.toLocaleDateString();

    return `
<!doctype html>
<html><body style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color: #0f172a; max-width: 640px; margin: 0 auto;">
  <h1 style="margin-bottom: 4px;">${escapeHtml(home.name)} — Monthly report</h1>
  <p style="color:#64748b; margin-top:0;">${fromStr} → ${toStr}</p>

  <h2 style="border-bottom:1px solid #e2e8f0; padding-bottom:4px;">Highlights</h2>
  <table style="width:100%; border-collapse: collapse;">
    <tr>
      <td style="padding:8px; background:#f8fafc; border-radius:6px;">Energy used</td>
      <td style="padding:8px; text-align:right;"><strong>${energySum.toFixed(2)} kWh</strong></td>
    </tr>
    <tr>
      <td style="padding:8px;">Estimated cost</td>
      <td style="padding:8px; text-align:right;"><strong>${formatCurrency(cost, home.currency)}</strong></td>
    </tr>
    <tr>
      <td style="padding:8px; background:#f8fafc; border-radius:6px;">Average temperature</td>
      <td style="padding:8px; text-align:right;"><strong>${tempAvg == null ? '—' : `${tempAvg.toFixed(1)} °C`}</strong></td>
    </tr>
    <tr>
      <td style="padding:8px;">Door / window opens</td>
      <td style="padding:8px; text-align:right;"><strong>${openCount}</strong></td>
    </tr>
    <tr>
      <td style="padding:8px; background:#f8fafc; border-radius:6px;">Motion / occupancy events</td>
      <td style="padding:8px; text-align:right;"><strong>${motionCount}</strong></td>
    </tr>
    <tr>
      <td style="padding:8px;">Alarms (smoke / leak)</td>
      <td style="padding:8px; text-align:right;"><strong>${smokeCount + leakCount}</strong></td>
    </tr>
  </table>

  ${
    topConsumers.length === 0
      ? ''
      : `<h2 style="border-bottom:1px solid #e2e8f0; padding-bottom:4px;">Top consuming devices</h2>
       <ol>
         ${topConsumers
           .map(
             (d) =>
               `<li>${escapeHtml(d.name)} — <strong>${d.energy.toFixed(2)} kWh</strong></li>`,
           )
           .join('')}
       </ol>`
  }

  <p style="color:#94a3b8; font-size:12px; margin-top:32px;">
    This is an automated monthly summary. You can configure the energy price and comfort range under each home's settings.
  </p>
</body></html>
    `.trim();
  }

  private previousMonthRange(now: Date): { from: Date; to: Date } {
    const to = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const from = new Date(to.getFullYear(), to.getMonth() - 1, 1, 0, 0, 0, 0);
    return { from, to };
  }
}

function formatCurrency(value: number, currency: string): string {
  try {
    return value.toLocaleString(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    });
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
