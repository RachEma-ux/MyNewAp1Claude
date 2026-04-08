/**
 * AI Agent Studio — Memory Page
 *
 * Session, persistent, episodic, preference, shared memory. Each with
 * enable/disable, retention, read/write permissions, deletion policy,
 * privacy rules. Visual memory architecture panel.
 */
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Database } from "lucide-react";
import { PageHeader, LoadingState } from "@/components/agent-studio/ui";

const MEMORY_TYPES = [
  { key: "session", label: "Session", desc: "Per-conversation context" },
  { key: "persistent", label: "Persistent", desc: "Long-lived facts" },
  { key: "episodic", label: "Episodic", desc: "Past interactions" },
  { key: "preference", label: "Preference", desc: "User preferences" },
  { key: "shared", label: "Shared / Team", desc: "Cross-agent memory" },
];

export default function AgentMemoryPage({ agentId }: { agentId: number }) {
  const utils = trpc.useUtils();
  const query = trpc.agentStudio.memory.get.useQuery({ agentId });
  const updateMut = trpc.agentStudio.memory.update.useMutation({
    onSuccess: () => {
      toast.success("Memory updated");
      utils.agentStudio.memory.get.invalidate({ agentId });
      utils.agentStudio.shell.getShellSummary.invalidate({ agentId });
    },
    onError: (e) => toast.error(e.message),
  });

  const [configs, setConfigs] = useState<Record<string, any>>({});

  useEffect(() => {
    if (query.data?.configs) {
      const map: Record<string, any> = {};
      for (const c of query.data.configs) {
        map[c.memoryType] = c;
      }
      setConfigs(map);
    }
  }, [query.data]);

  if (query.isLoading) return <LoadingState label="Loading memory…" />;

  const updateLocal = (type: string, patch: any) => {
    setConfigs({ ...configs, [type]: { ...(configs[type] ?? { memoryType: type, enabled: false }), ...patch } });
  };

  const handleSave = () => {
    const out = MEMORY_TYPES.map((m) => {
      const c = configs[m.key] ?? { memoryType: m.key, enabled: false };
      return {
        memoryType: m.key as any,
        enabled: !!c.enabled,
        retentionDays: c.retentionDays ?? null,
        readPermissions: c.readPermissions ?? [],
        writePermissions: c.writePermissions ?? [],
        deletionPolicy: c.deletionPolicy ?? "manual",
        privacyRules: c.privacyRules ?? {},
      };
    });
    updateMut.mutate({ agentId, configs: out });
  };

  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Memory"
        subtitle="Session, persistent, episodic, preference, and shared memory configuration"
        icon={<Database className="h-4 w-4" />}
      />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
      {/* Memory architecture panel */}
      <Card className="lg:col-span-1">
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold mb-2">Memory Architecture</h3>
          <div className="space-y-2">
            {MEMORY_TYPES.map((m) => {
              const enabled = !!configs[m.key]?.enabled;
              return (
                <div
                  key={m.key}
                  className={`border rounded p-2 text-xs flex items-center gap-2 ${
                    enabled ? "border-emerald-500/40 bg-emerald-500/5" : "border-muted"
                  }`}
                >
                  <Database className={`h-4 w-4 ${enabled ? "text-emerald-500" : "text-muted-foreground/40"}`} />
                  <div className="flex-1">
                    <div className="font-medium">{m.label}</div>
                    <div className="text-[10px] text-muted-foreground">{m.desc}</div>
                  </div>
                  <span className={`text-[9px] uppercase ${enabled ? "text-emerald-500" : "text-muted-foreground/40"}`}>
                    {enabled ? "ON" : "OFF"}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Memory config */}
      <Card className="lg:col-span-2">
        <CardContent className="p-4 space-y-3">
          <h3 className="text-base font-semibold">Memory Configuration</h3>
          {MEMORY_TYPES.map((m) => {
            const c = configs[m.key] ?? { memoryType: m.key, enabled: false };
            return (
              <div key={m.key} className="border rounded p-2 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium">{m.label}</div>
                  <label className="flex items-center gap-2 text-[10px]">
                    <input
                      type="checkbox"
                      checked={!!c.enabled}
                      onChange={(e) => updateLocal(m.key, { enabled: e.target.checked })}
                    />
                    Enabled
                  </label>
                </div>
                {c.enabled && (
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Retention (days)">
                      <Input
                        type="number"
                        value={c.retentionDays ?? ""}
                        onChange={(e) =>
                          updateLocal(m.key, {
                            retentionDays: e.target.value ? parseInt(e.target.value, 10) : null,
                          })
                        }
                        className="h-7 text-[10px]"
                      />
                    </Field>
                    <Field label="Deletion Policy">
                      <select
                        value={c.deletionPolicy ?? "manual"}
                        onChange={(e) => updateLocal(m.key, { deletionPolicy: e.target.value })}
                        className="h-7 px-2 rounded border bg-background text-[10px] w-full"
                      >
                        <option value="manual">Manual</option>
                        <option value="auto_expire">Auto-expire</option>
                        <option value="on_request">On Request</option>
                      </select>
                    </Field>
                  </div>
                )}
              </div>
            );
          })}
          <Button size="sm" onClick={handleSave} disabled={updateMut.isPending}>
            {updateMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            Save Memory Config
          </Button>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <Label className="text-[9px] uppercase text-muted-foreground/70">{label}</Label>
      {children}
    </div>
  );
}
