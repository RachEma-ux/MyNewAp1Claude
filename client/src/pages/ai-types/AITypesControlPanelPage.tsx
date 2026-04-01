/**
 * AI Types Control Panel
 *
 * Admin actions: re-scan catalog, seed taxonomy, bulk operations,
 * and module health summary.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Settings,
  RefreshCw,
  Layers,
  ShieldCheck,
  Database,
  Loader2,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function AITypesControlPanelPage() {
  const utils = trpc.useUtils();
  const { data: validationSummary, isLoading: valLoading } = trpc.aiTypes.validation.summary.useQuery();
  const { data: taxonomyStats } = trpc.aiTypes.taxonomy.stats.useQuery();
  const { data: relSummary } = trpc.aiTypes.relationships.summary.useQuery();

  const seedMutation = trpc.aiTypes.taxonomy.seed.useMutation({
    onSuccess: (result) => {
      toast.success(`Seeded ${result.created} taxonomy nodes`);
      utils.aiTypes.taxonomy.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const [rescanning, setRescanning] = useState(false);
  const handleRescan = async () => {
    setRescanning(true);
    try {
      await utils.aiTypes.validation.summary.invalidate();
      await utils.aiTypes.validation.scan.invalidate();
      await utils.aiTypes.relationships.graph.invalidate();
      await utils.aiTypes.relationships.summary.invalidate();
      toast.success("Validation and relationship caches refreshed");
    } finally {
      setRescanning(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-5xl">
      <div className="flex items-center gap-3 mb-6">
        <Settings className="h-6 w-6 text-zinc-400" />
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">AI Types Control Panel</h1>
          <p className="text-sm text-zinc-500">Admin actions and module health</p>
        </div>
      </div>

      {/* Module health */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="pt-4 pb-3 text-center">
            <Database className="h-5 w-5 mx-auto mb-1 text-zinc-400" />
            <div className="text-2xl font-bold text-zinc-100">
              {valLoading ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : validationSummary?.total || 0}
            </div>
            <div className="text-xs text-zinc-500">Catalog Entries</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="pt-4 pb-3 text-center">
            <Layers className="h-5 w-5 mx-auto mb-1 text-zinc-400" />
            <div className="text-2xl font-bold text-zinc-100">
              {taxonomyStats ? Object.values(taxonomyStats.byLevel as Record<string, number>).reduce((a, b) => a + b, 0) : 0}
            </div>
            <div className="text-xs text-zinc-500">Taxonomy Nodes</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="pt-4 pb-3 text-center">
            <ShieldCheck className="h-5 w-5 mx-auto mb-1 text-emerald-400" />
            <div className="text-2xl font-bold text-emerald-400">
              {validationSummary?.healthPercent || 0}%
            </div>
            <div className="text-xs text-zinc-500">Health Score</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="pt-4 pb-3 text-center">
            <Settings className="h-5 w-5 mx-auto mb-1 text-purple-400" />
            <div className="text-2xl font-bold text-purple-400">
              {relSummary?.totalEdges || 0}
            </div>
            <div className="text-xs text-zinc-500">Relationships</div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <Card className="bg-zinc-900/50 border-zinc-800 mb-4">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-400">Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-zinc-200">Re-scan Validation</div>
              <div className="text-xs text-zinc-500">Refresh all completeness and consistency checks</div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRescan}
              disabled={rescanning}
              className="gap-1.5"
            >
              {rescanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Re-scan
            </Button>
          </div>

          <div className="border-t border-zinc-800" />

          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-zinc-200">Seed Taxonomy</div>
              <div className="text-xs text-zinc-500">Initialize default classification tree for all entry types</div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
              className="gap-1.5"
            >
              {seedMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Layers className="h-3.5 w-3.5" />}
              Seed
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Issue summary */}
      {validationSummary && (
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-sm text-zinc-400">Issue Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span className="text-sm text-zinc-300">{validationSummary.healthy} entries are healthy</span>
              </div>
              {validationSummary.warnings > 0 && (
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-400" />
                  <span className="text-sm text-zinc-300">{validationSummary.warnings} entries have warnings</span>
                  <Badge variant="outline" className="text-[10px] bg-yellow-500/15 text-yellow-400 border-yellow-500/30 ml-auto">
                    needs attention
                  </Badge>
                </div>
              )}
              {validationSummary.errors > 0 && (
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-400" />
                  <span className="text-sm text-zinc-300">{validationSummary.errors} entries have errors</span>
                  <Badge variant="outline" className="text-[10px] bg-red-500/15 text-red-400 border-red-500/30 ml-auto">
                    action required
                  </Badge>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
