import { useState } from 'react';
import { Copy, Check, ExternalLink } from 'lucide-react';
import { Button } from '../ui/button';
import {
  PROTOCOL_CATALOG,
  buildIntegrationConfig,
  type Protocol,
} from '../../lib/integration-templates';

interface IntegrationsPanelProps {
  uniqueId: string;
  password: string;
  host: string;
  port: number;
}

/**
 * Per-home "Integrations" panel: one card per protocol with a ready-to-copy edge
 * configuration. The home's single MQTT credential works for every protocol; only
 * the topic namespace / client_id / discovery prefix differ.
 */
export function IntegrationsPanel({
  uniqueId,
  password,
  host,
  port,
}: IntegrationsPanelProps) {
  const [selected, setSelected] = useState<Protocol>('zigbee');
  const [copied, setCopied] = useState(false);

  const info = PROTOCOL_CATALOG.find((p) => p.protocol === selected)!;
  const config = buildIntegrationConfig(selected, {
    host,
    port,
    username: uniqueId,
    password,
    uniqueId,
  });

  const copy = () => {
    navigator.clipboard.writeText(config.snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border-t border-border pt-4">
      <h4 className="text-lg font-semibold mb-1 text-foreground">
        Integraciones
      </h4>
      <p className="text-xs text-muted-foreground mb-4">
        Misma credencial MQTT para todos los protocolos. Copia la configuración y
        pégala en el bridge oficial correspondiente.
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        {PROTOCOL_CATALOG.map((p) => (
          <Button
            key={p.protocol}
            size="sm"
            variant={p.protocol === selected ? 'default' : 'outline'}
            onClick={() => setSelected(p.protocol)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      <div className="bg-background/50 rounded-lg border border-border p-4">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <p className="text-sm font-medium text-foreground">
              {info.description}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Imagen oficial:{' '}
              <span className="font-mono">{info.image}</span> · Destino:{' '}
              <span className="font-mono">{config.target}</span>
            </p>
            <a
              href={info.docsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
            >
              Documentación <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <Button size="sm" variant="ghost" onClick={copy} className="shrink-0">
            {copied ? (
              <>
                <Check className="h-3 w-3 mr-1" /> Copiado
              </>
            ) : (
              <>
                <Copy className="h-3 w-3 mr-1" /> Copiar
              </>
            )}
          </Button>
        </div>

        <pre className="overflow-x-auto rounded-md bg-muted/40 p-3 text-xs font-mono text-foreground whitespace-pre">
          {config.snippet}
        </pre>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 text-xs">
          <div>
            <span className="text-muted-foreground">Base topic: </span>
            <span className="font-mono">{config.baseTopic}</span>
          </div>
          {config.discoveryPrefix && (
            <div>
              <span className="text-muted-foreground">Discovery prefix: </span>
              <span className="font-mono">{config.discoveryPrefix}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
