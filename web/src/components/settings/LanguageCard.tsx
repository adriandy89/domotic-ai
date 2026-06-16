import { Languages } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import {
  LANGUAGE_LABELS,
  SUPPORTED_LANGUAGES,
  setAppLanguage,
} from '../../i18n';
import { useAuthStore } from '../../store/useAuthStore';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../ui/card';
import { Label } from '../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';

export default function LanguageCard() {
  const { t, i18n } = useTranslation();
  const { user, updateUser } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = (i18n.resolvedLanguage ?? i18n.language) as string;

  const handleChange = async (value: string) => {
    if (value === current) return;
    const previous = current;
    setError(null);
    setLoading(true);
    // Optimistically switch the UI; revert if the request fails.
    setAppLanguage(value);
    try {
      await api.put('/users/me/language', { language: value });
      if (user) updateUser({ language: value });
    } catch (err) {
      console.error(err);
      setAppLanguage(previous);
      setError(t('settings.language.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="bg-card/40 border-border">
      <CardHeader className="flex flex-row items-center space-x-2 pb-3">
        <div className="p-3 bg-primary/10 rounded-full">
          <Languages className="h-8 w-8 text-primary" />
        </div>
        <div>
          <CardTitle className="text-xl">
            {t('settings.language.title')}
          </CardTitle>
          <CardDescription>
            {t('settings.language.description')}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid gap-2 max-w-xs">
          <Label htmlFor="language-select">
            {t('settings.language.label')}
          </Label>
          <Select
            value={current}
            onValueChange={handleChange}
            disabled={loading}
          >
            <SelectTrigger id="language-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUPPORTED_LANGUAGES.map((lng) => (
                <SelectItem key={lng} value={lng}>
                  {LANGUAGE_LABELS[lng]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {error && (
          <p className="text-red-500 text-sm bg-red-500/10 p-2 rounded">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
