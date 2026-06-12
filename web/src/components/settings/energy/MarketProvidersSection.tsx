import { KeyRound, Loader2 } from 'lucide-react';
import { forwardRef, useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '../../../store/useAuthStore';
import {
  usePricingStore,
  type AdminPricingProvider,
} from '../../../store/usePricingStore';
import { Badge } from '../../ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../ui/card';
import ProviderRow from './ProviderRow';

/**
 * Provider token management. ADMINs get the full form per provider; everyone
 * else sees read-only availability so they understand why a provider is
 * greyed out in the tariff selector.
 */
const MarketProvidersSection = forwardRef<HTMLDivElement>((_props, ref) => {
  const { user } = useAuthStore();
  const { fetchProviders, fetchAdminProviders, saveProviderCredentials } =
    usePricingStore();
  const isAdmin = user?.role === 'ADMIN';

  const [providers, setProviders] = useState<AdminPricingProvider[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    if (isAdmin) {
      const data = await fetchAdminProviders();
      setProviders(data);
      if (data.length === 0) {
        setError(usePricingStore.getState().error);
      }
    } else {
      const data = await fetchProviders();
      setProviders(
        data.map((p) => ({
          ...p,
          token_status: p.enabled ? 'configured' : 'not_configured',
          token_origin: null,
          token_masked: null,
          token_updated_at: null,
        })),
      );
    }
  }, [isAdmin, fetchAdminProviders, fetchProviders]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave(source: string, token: string): Promise<boolean> {
    const updated = await saveProviderCredentials(source, token);
    if (!updated) return false;
    setProviders((prev) =>
      prev ? prev.map((p) => (p.source === source ? updated : p)) : prev,
    );
    return true;
  }

  return (
    <Card ref={ref} className="bg-card/40 border-border scroll-mt-4">
      <CardHeader className="flex flex-row items-center space-x-2 pb-3">
        <div className="p-3 bg-primary/10 rounded-full">
          <KeyRound className="h-8 w-8 text-primary" />
        </div>
        <div>
          <CardTitle className="text-xl">Market price providers</CardTitle>
          <CardDescription>
            API tokens used to fetch hourly market prices (PVPC, ENTSO-E…) for
            dynamic tariffs.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {providers === null ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : providers.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 border border-dashed border-border rounded-lg">
            <p className="text-muted-foreground">No providers available</p>
          </div>
        ) : isAdmin ? (
          providers.map((p) => (
            <ProviderRow key={p.source} provider={p} onSave={handleSave} />
          ))
        ) : (
          <>
            {providers.map((p) => (
              <div
                key={p.source}
                className="flex flex-wrap items-center justify-between gap-2 p-4 rounded-lg border border-border/50 bg-background/50"
              >
                <p className="font-medium">{p.label}</p>
                <Badge variant={p.enabled ? 'success' : 'warning'}>
                  {p.enabled ? 'Configured' : 'Not configured'}
                </Badge>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              Only administrators can manage provider tokens.
            </p>
          </>
        )}
        {error && (
          <p className="text-red-500 text-sm bg-red-500/10 p-2 rounded">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
});
MarketProvidersSection.displayName = 'MarketProvidersSection';

export default MarketProvidersSection;
