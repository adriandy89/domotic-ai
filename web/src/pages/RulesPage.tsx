import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, Plus, Loader2, Filter, Home } from 'lucide-react';
import { useRulesStore } from '../store/useRulesStore';
import { useHomesStore } from '../store/useHomesStore';
import RuleCard from '../components/rule/RuleCard';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';

export default function RulesPage() {
  const navigate = useNavigate();
  const { rules, isLoading, error, fetchRules, toggleRule, deleteRule } =
    useRulesStore();
  const { homes, homeIds } = useHomesStore();
  const [selectedHomeId, setSelectedHomeId] = useState<string | null>(null);

  // Fetch rules on mount
  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  // Filter rules by selected home
  const filteredRules = useMemo(() => {
    if (!selectedHomeId) return rules;
    return rules.filter((rule) => rule.home_id === selectedHomeId);
  }, [rules, selectedHomeId]);

  // Get home list for filter
  const homeList = useMemo(() => {
    return homeIds.map((id) => homes[id]).filter(Boolean);
  }, [homeIds, homes]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
            Rules
          </h1>
          <p className="text-muted-foreground mt-1">
            Automate your smart home with conditional rules
          </p>
        </div>
        <Button
          className="flex items-center gap-2"
          onClick={() => navigate('/rules/new')}
        >
          <Plus className="w-4 h-4" />
          New Rule
        </Button>
      </div>

      {/* Stats Summary */}
      {rules.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="bg-card/40 border-border">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-primary">
                {rules.length}
              </div>
              <div className="text-xs text-muted-foreground">Total Rules</div>
            </CardContent>
          </Card>
          <Card className="bg-card/40 border-border">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-emerald-500">
                {rules.filter((r) => r.active).length}
              </div>
              <div className="text-xs text-muted-foreground">Active</div>
            </CardContent>
          </Card>
          <Card className="bg-card/40 border-border">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-muted-foreground">
                {rules.filter((r) => !r.active).length}
              </div>
              <div className="text-xs text-muted-foreground">Inactive</div>
            </CardContent>
          </Card>
          <Card className="bg-card/40 border-border">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-amber-500">
                {rules.reduce((acc, r) => acc + r._count.conditions, 0)}
              </div>
              <div className="text-xs text-muted-foreground">
                Total Conditions
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Home Filter */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Filter by home:</span>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={selectedHomeId === null ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedHomeId(null)}
            className="text-xs"
          >
            All Homes
          </Button>
          {homeList.map((home) => (
            <Button
              key={home.id}
              variant={selectedHomeId === home.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedHomeId(home.id)}
              className="text-xs flex items-center gap-1"
            >
              <Home className="w-3 h-3" />
              {home.name}
            </Button>
          ))}
        </div>
      </div>

      {/* Error State */}
      {error && (
        <Card className="bg-destructive/10 border-destructive/30">
          <CardContent className="p-4 text-center">
            <p className="text-destructive">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchRules}
              className="mt-2"
            >
              Try Again
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {isLoading && rules.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
          <span className="text-muted-foreground">Loading rules...</span>
        </div>
      )}

      {/* Rules Grid */}
      {!isLoading && filteredRules.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredRules.map((rule) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              onToggle={toggleRule}
              onDelete={deleteRule}
              onEdit={(id) => navigate(`/rules/edit/${id}`)}
            />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && filteredRules.length === 0 && (
        <Card className="bg-card/40 border-border">
          <CardContent className="py-16 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              <Zap className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No rules found</h3>
            <p className="text-muted-foreground text-sm mb-4">
              {selectedHomeId
                ? `No rules configured for "${homeList.find((h) => h.id === selectedHomeId)?.name}"`
                : 'Create your first rule to automate your smart home'}
            </p>
            <Button disabled>
              <Plus className="w-4 h-4 mr-2" />
              Create Rule
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
