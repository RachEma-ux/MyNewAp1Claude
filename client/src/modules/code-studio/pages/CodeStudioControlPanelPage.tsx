import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Settings, Database, Cpu, Activity, ScrollText, Plug, Check } from "lucide-react";

export default function CodeStudioControlPanelPage() {
  const healthQuery = trpc.codeStudio.health.status.useQuery();
  const summaryQuery = trpc.codeStudio.health.summary.useQuery();
  const auditQuery = trpc.codeStudio.audit.list.useQuery({});
  const providerQuery = trpc.codeStudio.settings.get.useQuery({ key: "opencode_provider" });
  const catalogQuery = trpc.codeStudio.catalogImports.list.useQuery();
  const utils = trpc.useUtils();

  const setSettingMut = trpc.codeStudio.settings.set.useMutation({
    onSuccess: () => {
      utils.codeStudio.settings.get.invalidate({ key: "opencode_provider" });
    },
  });

  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const health = healthQuery.data;
  const summary = summaryQuery.data;
  const audits = auditQuery.data ?? [];

  const providerSetting = providerQuery.data?.value as any;
  const providerName = providerSetting?.name ?? null;

  const providers = (catalogQuery.data ?? []).filter(
    (item: any) => item.entryType === "provider"
  );

  const isLoading = healthQuery.isLoading || summaryQuery.isLoading;

  function handleSave() {
    const chosen = providers.find((p: any) => p.id === selectedId);
    if (!chosen) return;
    setSettingMut.mutate({
      key: "opencode_provider",
      value: {
        catalogImportId: chosen.id,
        name: chosen.name,
        config: chosen.config ?? {},
      },
    });
    setPickerOpen(false);
    setSelectedId(null);
  }

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-sm font-semibold flex items-center gap-2">
        <Settings className="h-4 w-4 text-zinc-400" /> Control Panel
      </h2>

      {isLoading && <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin" /></div>}

      {!isLoading && (
        <>
          {/* Runtime Health */}
          <Card>
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold">
                <Cpu className="h-3.5 w-3.5 text-violet-500" /> Runtime Status
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">CODEDB</span>
                  <Badge variant={health?.codedb?.connected ? "default" : "destructive"} className="text-[9px]">
                    {health?.codedb?.connected ? `Connected (${health.codedb.tableCount} tables)` : "Disconnected"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">OpenCode</span>
                  <Badge variant={health?.opencode?.healthy ? "default" : "outline"} className="text-[9px]">
                    {health?.opencode?.healthy ? "Reachable" : "Offline"}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Provider Configuration */}
          <Card>
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <Plug className="h-3.5 w-3.5 text-emerald-500" /> Provider Configuration
                </div>
                <Badge variant={providerName ? "default" : "outline"} className="text-[9px]">
                  {providerName ?? "Not configured"}
                </Badge>
              </div>
              <p className="text-[10px] text-muted-foreground">
                {providerName
                  ? `OpenCode will use "${providerName}" as its LLM provider.`
                  : "Select a provider for OpenCode to use."}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7"
                onClick={() => setPickerOpen(true)}
              >
                Set Provider
              </Button>
            </CardContent>
          </Card>

          {/* Provider Picker Dialog */}
          <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="text-sm">Select Provider</DialogTitle>
              </DialogHeader>
              {providers.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4">
                  Import a provider from AI Catalog first.
                </p>
              ) : (
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {providers.map((p: any) => (
                    <button
                      key={p.id}
                      onClick={() => setSelectedId(p.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded text-xs hover:bg-muted/50 transition-colors ${
                        selectedId === p.id ? "bg-muted ring-1 ring-primary" : ""
                      }`}
                    >
                      <div className="flex flex-col items-start">
                        <span className="font-medium">{p.name}</span>
                        {p.description && (
                          <span className="text-[10px] text-muted-foreground">{p.description}</span>
                        )}
                      </div>
                      {selectedId === p.id && <Check className="h-3.5 w-3.5 text-primary" />}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setPickerOpen(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="text-xs h-7"
                  disabled={!selectedId || setSettingMut.isPending}
                  onClick={handleSave}
                >
                  {setSettingMut.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                  Save
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Module Summary */}
          {summary && (
            <Card>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <Database className="h-3.5 w-3.5 text-blue-500" /> Module Summary
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {Object.entries(summary).map(([key, val]) => (
                    <div key={key} className="flex flex-col items-center p-2 rounded bg-muted/30">
                      <span className="text-lg font-bold">{String(val)}</span>
                      <span className="text-[9px] text-muted-foreground capitalize">{key.replace(/([A-Z])/g, " $1").trim()}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recent Audit Events */}
          <Card>
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <ScrollText className="h-3.5 w-3.5 text-amber-500" /> Recent Audit Events
                </div>
                <Badge variant="secondary" className="text-[9px]">{audits.length}</Badge>
              </div>
              {audits.length === 0 && <p className="text-[10px] text-muted-foreground">No audit events recorded yet.</p>}
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {audits.slice(0, 20).map((e: any) => (
                  <div key={e.id} className="flex items-center justify-between py-1 px-2 rounded text-[10px] bg-muted/20">
                    <div className="flex items-center gap-2">
                      <Activity className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium">{e.eventType?.replace(/_/g, " ")}</span>
                      <span className="text-muted-foreground">{e.entityType} #{e.entityId}</span>
                    </div>
                    {e.createdAt && <span className="text-muted-foreground">{new Date(e.createdAt).toLocaleString()}</span>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
