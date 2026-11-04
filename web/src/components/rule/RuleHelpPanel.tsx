import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  ArrowRight,
  BookOpen,
  CalendarClock,
  ChevronDown,
  Lightbulb,
  ListChecks,
  SlidersHorizontal,
  X,
  Zap,
} from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

type SectionId =
  | 'overview'
  | 'basic'
  | 'conditions'
  | 'window'
  | 'results'
  | 'example';

interface RuleHelpPanelProps {
  open: boolean;
  onClose: () => void;
  /** Picks the initially expanded section: conditions when the form has some. */
  hasConditions?: boolean;
}

/** One term + explanation row inside a section. */
const Term = ({ name, children }: { name: string; children: React.ReactNode }) => (
  <div>
    <dt className="text-sm font-medium text-foreground">{name}</dt>
    <dd className="text-sm text-muted-foreground">{children}</dd>
  </div>
);

/** Highlighted example block. */
const Example = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="border-l-2 border-primary/50 bg-primary/5 rounded-r-md px-3 py-2">
    <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
      {label}
    </p>
    <p className="text-xs text-muted-foreground">{children}</p>
  </div>
);

/**
 * Non-modal help side panel for the rule form. Explains the WHEN→THEN mental
 * model and every important field, section by section, mirroring the form's
 * cards. Stays open while the user edits the form (no overlay on md+).
 */
export function RuleHelpPanel({ open, onClose, hasConditions }: RuleHelpPanelProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<SectionId | null>(
    hasConditions ? 'conditions' : 'overview',
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const sections: {
    id: SectionId;
    icon: React.ElementType;
    iconClass: string;
    body: React.ReactNode;
  }[] = [
    {
      id: 'overview',
      icon: BookOpen,
      iconClass: 'text-primary bg-primary/10',
      body: (
        <div className="space-y-3">
          {/* Signature flow strip: the rule's mental model at a glance. */}
          <div className="flex items-center justify-between gap-1 rounded-lg border border-border bg-muted/30 px-3 py-3">
            {(
              [
                { icon: Activity, label: t('rules.help.flow.data') },
                { icon: ListChecks, label: t('rules.help.flow.conditions') },
                { icon: Zap, label: t('rules.help.flow.actions') },
              ] as const
            ).map((step, i) => (
              <div key={step.label} className="contents">
                {i > 0 && (
                  <ArrowRight className="w-4 h-4 shrink-0 text-muted-foreground" />
                )}
                <div className="flex flex-col items-center gap-1 text-center">
                  <step.icon className="w-5 h-5 text-primary" />
                  <span className="text-[11px] leading-tight text-muted-foreground">
                    {step.label}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            {t('rules.help.overview.p1')}
          </p>
          <p className="text-sm text-muted-foreground">
            {t('rules.help.overview.p2')}
          </p>
          <Example label={t('rules.help.exampleLabel')}>
            {t('rules.help.overview.example')}
          </Example>
        </div>
      ),
    },
    {
      id: 'basic',
      icon: SlidersHorizontal,
      iconClass: 'text-sky-500 bg-sky-500/10',
      body: (
        <dl className="space-y-3">
          <Term name={t('rules.help.basic.typeName')}>
            {t('rules.help.basic.typeDesc')}
          </Term>
          <Term name={t('rules.help.basic.waitName')}>
            {t('rules.help.basic.waitDesc')}
          </Term>
          <Example label={t('rules.help.exampleLabel')}>
            {t('rules.help.basic.waitExample')}
          </Example>
          <Term name={t('rules.help.basic.activeName')}>
            {t('rules.help.basic.activeDesc')}
          </Term>
          <Term name={t('rules.help.basic.allName')}>
            {t('rules.help.basic.allDesc')}
          </Term>
          <Term name={t('rules.help.basic.offlineName')}>
            {t('rules.help.basic.offlineDesc')}
          </Term>
        </dl>
      ),
    },
    {
      id: 'conditions',
      icon: ListChecks,
      iconClass: 'text-purple-400 bg-purple-400/10',
      body: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t('rules.help.conditions.p1')}
          </p>
          <dl className="space-y-3">
            <Term name={t('rules.help.conditions.absenceName')}>
              {t('rules.help.conditions.absenceDesc')}
            </Term>
            <Term name={t('rules.help.conditions.triggerName')}>
              {t('rules.help.conditions.triggerDesc')}
            </Term>
          </dl>
          <Example label={t('rules.help.exampleLabel')}>
            {t('rules.help.conditions.triggerExample')}
          </Example>
        </div>
      ),
    },
    {
      id: 'window',
      icon: CalendarClock,
      iconClass: 'text-emerald-500 bg-emerald-500/10',
      body: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t('rules.help.window.p1')}
          </p>
          <Example label={t('rules.help.exampleLabel')}>
            {t('rules.help.window.example')}
          </Example>
        </div>
      ),
    },
    {
      id: 'results',
      icon: Zap,
      iconClass: 'text-amber-500 bg-amber-500/10',
      body: (
        <dl className="space-y-3">
          <Term name={t('rules.help.results.commandName')}>
            {t('rules.help.results.commandDesc')}
          </Term>
          <Term name={t('rules.help.results.notificationName')}>
            {t('rules.help.results.notificationDesc')}
          </Term>
        </dl>
      ),
    },
    {
      id: 'example',
      icon: Lightbulb,
      iconClass: 'text-rose-400 bg-rose-400/10',
      body: (
        <div className="space-y-3">
          {/* A real sequence, so numbered steps carry meaning here. */}
          <ol className="space-y-2">
            {([1, 2, 3, 4] as const).map((n) => (
              <li key={n} className="flex gap-2.5 text-sm text-muted-foreground">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                  {n}
                </span>
                <span>{t(`rules.help.example.step${n}`)}</span>
              </li>
            ))}
          </ol>
          <Example label={t('rules.help.example.tipLabel')}>
            {t('rules.help.example.tip')}
          </Example>
        </div>
      ),
    },
  ];

  return createPortal(
    <div className="fixed inset-0 z-[90] pointer-events-none">
      {/* Mobile only: dim the form; on md+ the form stays interactive. */}
      <div
        className="absolute inset-0 bg-black/50 md:hidden pointer-events-auto"
        onClick={onClose}
      />
      <aside
        role="complementary"
        aria-label={t('rules.help.title')}
        className="pointer-events-auto absolute right-0 top-0 flex h-full w-full flex-col border-l border-border bg-card shadow-2xl animate-slide-in-right md:w-[420px]"
      >
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
            <BookOpen className="w-5 h-5 text-primary" />
            {t('rules.help.title')}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label={t('rules.help.close')}
          >
            <X className="w-4 h-4" />
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          <p className="pb-3 text-sm text-muted-foreground">
            {t('rules.help.intro')}
          </p>
          <div className="divide-y divide-border rounded-lg border border-border">
            {sections.map(({ id, icon: Icon, iconClass, body }) => {
              const isOpen = expanded === id;
              return (
                <section key={id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-muted/40 transition-colors"
                    aria-expanded={isOpen}
                    aria-controls={`rule-help-${id}`}
                    onClick={() => setExpanded(isOpen ? null : id)}
                  >
                    <span
                      className={cn(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
                        iconClass,
                      )}
                    >
                      <Icon className="w-4 h-4" />
                    </span>
                    <span className="flex-1 text-sm font-medium text-foreground">
                      {t(`rules.help.${id}.title`)}
                    </span>
                    <ChevronDown
                      className={cn(
                        'w-4 h-4 text-muted-foreground transition-transform',
                        isOpen && 'rotate-180',
                      )}
                    />
                  </button>
                  {isOpen && (
                    <div id={`rule-help-${id}`} className="px-3 pb-4">
                      {body}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      </aside>
    </div>,
    document.body,
  );
}
