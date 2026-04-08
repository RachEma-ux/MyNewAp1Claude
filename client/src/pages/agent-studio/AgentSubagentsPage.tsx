/**
 * AI Agent Studio — Subagents Page
 *
 * Custom subagent definitions attached to a draft. Mirrors openllm-agent2's
 * `AgentDefinition` schema exactly:
 *   - description, prompt (system prompt)
 *   - tools (allow-list), disallowedTools
 *   - model alias, maxTurns, background, effort
 *   - permissionMode, memory scope
 *   - initialPrompt, criticalSystemReminder
 *
 * Each subagent here corresponds to one custom agent that the parent agent
 * can launch via the Agent tool.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Users, Edit3 } from "lucide-react";
import {
  PageHeader,
  EmptyState,
  LoadingState,
  SectionLabel,
} from "@/components/agent-studio/ui";

const PERMISSION_MODES = [
  { value: "", label: "(inherit)" },
  { value: "default", label: "default" },
  { value: "acceptEdits", label: "acceptEdits" },
  { value: "bypassPermissions", label: "bypassPermissions" },
  { value: "plan", label: "plan" },
  { value: "dontAsk", label: "dontAsk" },
];

const MEMORY_SCOPES = [
  { value: "", label: "(none)" },
  { value: "user", label: "user (~/.agent-studio/memory)" },
  { value: "project", label: "project (.agent-studio/memory)" },
  { value: "local", label: "local (.agent-studio/memory-local)" },
];

const EFFORT_LEVELS = [
  { value: "", label: "(inherit)" },
  { value: "low", label: "low" },
  { value: "medium", label: "medium" },
  { value: "high", label: "high" },
  { value: "max", label: "max" },
];

interface SubagentForm {
  subagentId?: number;
  name: string;
  description: string;
  prompt: string;
  toolsInput: string; // newline-separated
  disallowedToolsInput: string;
  model: string;
  maxTurns: string;
  background: boolean;
  effort: string;
  permissionMode: string;
  memory: string;
  initialPrompt: string;
  criticalSystemReminder: string;
}

const EMPTY_FORM: SubagentForm = {
  subagentId: undefined,
  name: "",
  description: "",
  prompt: "",
  toolsInput: "",
  disallowedToolsInput: "",
  model: "",
  maxTurns: "",
  background: false,
  effort: "",
  permissionMode: "",
  memory: "",
  initialPrompt: "",
  criticalSystemReminder: "",
};

export default function AgentSubagentsPage({ agentId }: { agentId: number }) {
  const utils = trpc.useUtils();
  const subagentsQuery = trpc.agentStudio.subagents.list.useQuery({ agentId });

  const saveMut = trpc.agentStudio.subagents.save.useMutation({
    onSuccess: () => {
      toast.success(form.subagentId ? "Subagent updated" : "Subagent created");
      utils.agentStudio.subagents.list.invalidate({ agentId });
      utils.agentStudio.shell.getShellSummary.invalidate({ agentId });
      setForm(EMPTY_FORM);
    },
    onError: (e) => toast.error(e.message),
  });

  const removeMut = trpc.agentStudio.subagents.remove.useMutation({
    onSuccess: () => {
      toast.success("Subagent removed");
      utils.agentStudio.subagents.list.invalidate({ agentId });
    },
    onError: (e) => toast.error(e.message),
  });

  const [form, setForm] = useState<SubagentForm>(EMPTY_FORM);

  if (subagentsQuery.isLoading)
    return <LoadingState label="Loading subagents…" />;

  const subagents = subagentsQuery.data ?? [];

  const handleSave = () => {
    if (!form.name || !form.prompt) {
      toast.error("Name and prompt are required");
      return;
    }
    saveMut.mutate({
      agentId,
      subagentId: form.subagentId,
      name: form.name,
      description: form.description || undefined,
      prompt: form.prompt,
      tools: form.toolsInput
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      disallowedTools: form.disallowedToolsInput
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      model: form.model || undefined,
      maxTurns: form.maxTurns ? parseInt(form.maxTurns, 10) : undefined,
      background: form.background,
      effort: form.effort || undefined,
      permissionMode: (form.permissionMode || undefined) as any,
      memory: (form.memory || undefined) as any,
      initialPrompt: form.initialPrompt || undefined,
      criticalSystemReminder: form.criticalSystemReminder || undefined,
    });
  };

  const handleEdit = (s: any) => {
    setForm({
      subagentId: s.id,
      name: s.name,
      description: s.description ?? "",
      prompt: s.prompt,
      toolsInput: (s.tools ?? []).join("\n"),
      disallowedToolsInput: (s.disallowedTools ?? []).join("\n"),
      model: s.model ?? "",
      maxTurns: s.maxTurns != null ? String(s.maxTurns) : "",
      background: !!s.background,
      effort: s.effort ?? "",
      permissionMode: s.permissionMode ?? "",
      memory: s.memory ?? "",
      initialPrompt: s.initialPrompt ?? "",
      criticalSystemReminder: s.criticalSystemReminder ?? "",
    });
    // Scroll to form
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCancel = () => setForm(EMPTY_FORM);

  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Subagents"
        subtitle="Custom subagents the parent can launch via the Agent tool"
        icon={<Users className="h-4 w-4" />}
        badges={
          <Badge variant="outline" className="text-[9px] uppercase tracking-wider ml-2">
            {subagents.length} defined
          </Badge>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Form */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <SectionLabel icon={<Plus className="h-3 w-3" />}>
              {form.subagentId ? "Edit Subagent" : "New Subagent"}
            </SectionLabel>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Name">
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. code-reviewer"
                  className="h-8 text-xs"
                />
              </Field>
              <Field label="Model (alias or ID)">
                <Input
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                  placeholder="(inherit) or sonnet, gpt-4o"
                  className="h-8 text-xs font-mono"
                />
              </Field>
            </div>

            <Field label="Description">
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="When this subagent should be used"
                className="h-8 text-xs"
              />
            </Field>

            <Field label="System Prompt">
              <Textarea
                value={form.prompt}
                onChange={(e) => setForm({ ...form, prompt: e.target.value })}
                className="text-xs min-h-[80px] font-mono"
                placeholder="The subagent's system prompt"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Allowed Tools (one per line)">
                <Textarea
                  value={form.toolsInput}
                  onChange={(e) =>
                    setForm({ ...form, toolsInput: e.target.value })
                  }
                  className="text-xs min-h-[60px] font-mono"
                  placeholder="Read&#10;Grep&#10;Glob"
                />
              </Field>
              <Field label="Disallowed Tools">
                <Textarea
                  value={form.disallowedToolsInput}
                  onChange={(e) =>
                    setForm({ ...form, disallowedToolsInput: e.target.value })
                  }
                  className="text-xs min-h-[60px] font-mono"
                  placeholder="Bash&#10;Write"
                />
              </Field>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Field label="Effort">
                <select
                  value={form.effort}
                  onChange={(e) => setForm({ ...form, effort: e.target.value })}
                  className="h-8 px-2 rounded border bg-background text-xs w-full"
                >
                  {EFFORT_LEVELS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Max Turns">
                <Input
                  type="number"
                  min="1"
                  value={form.maxTurns}
                  onChange={(e) => setForm({ ...form, maxTurns: e.target.value })}
                  className="h-8 text-xs"
                />
              </Field>
              <Field label="Permission Mode">
                <select
                  value={form.permissionMode}
                  onChange={(e) =>
                    setForm({ ...form, permissionMode: e.target.value })
                  }
                  className="h-8 px-2 rounded border bg-background text-xs w-full"
                >
                  {PERMISSION_MODES.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Memory Scope">
              <select
                value={form.memory}
                onChange={(e) => setForm({ ...form, memory: e.target.value })}
                className="h-8 px-2 rounded border bg-background text-xs w-full"
              >
                {MEMORY_SCOPES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>

            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={form.background}
                onChange={(e) =>
                  setForm({ ...form, background: e.target.checked })
                }
              />
              Run as fire-and-forget background task
            </label>

            <Field label="Initial Prompt (auto-submitted as first turn)">
              <Textarea
                value={form.initialPrompt}
                onChange={(e) =>
                  setForm({ ...form, initialPrompt: e.target.value })
                }
                className="text-xs min-h-[50px]"
              />
            </Field>

            <Field label="Critical System Reminder (experimental)">
              <Textarea
                value={form.criticalSystemReminder}
                onChange={(e) =>
                  setForm({ ...form, criticalSystemReminder: e.target.value })
                }
                className="text-xs min-h-[50px]"
              />
            </Field>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!form.name || !form.prompt || saveMut.isPending}
              >
                {saveMut.isPending && (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                )}
                {form.subagentId ? "Update" : "Create"} Subagent
              </Button>
              {form.subagentId && (
                <Button size="sm" variant="ghost" onClick={handleCancel}>
                  Cancel
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Subagent list */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <SectionLabel>Defined Subagents</SectionLabel>

            {subagents.length === 0 ? (
              <EmptyState
                icon={<Users className="h-7 w-7" />}
                title="No subagents defined yet"
                description="Subagents are custom agents the parent can launch via the Agent tool."
              />
            ) : (
              <ul className="space-y-2">
                {subagents.map((s: any) => (
                  <li
                    key={s.id}
                    className={`border rounded p-3 text-xs space-y-1 ${
                      form.subagentId === s.id
                        ? "border-primary bg-primary/5"
                        : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{s.name}</div>
                        {s.description && (
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {s.description}
                          </div>
                        )}
                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                          {s.model && (
                            <Badge variant="outline" className="text-[9px] font-mono">
                              {s.model}
                            </Badge>
                          )}
                          {s.permissionMode && (
                            <Badge variant="outline" className="text-[9px]">
                              {s.permissionMode}
                            </Badge>
                          )}
                          {s.memory && (
                            <Badge variant="outline" className="text-[9px]">
                              memory: {s.memory}
                            </Badge>
                          )}
                          {s.background && (
                            <Badge
                              variant="outline"
                              className="text-[9px] border-purple-500/40 text-purple-400"
                            >
                              background
                            </Badge>
                          )}
                          {s.effort && (
                            <Badge variant="outline" className="text-[9px]">
                              effort: {s.effort}
                            </Badge>
                          )}
                          {s.maxTurns && (
                            <Badge variant="outline" className="text-[9px]">
                              max {s.maxTurns} turns
                            </Badge>
                          )}
                        </div>
                        {(s.tools ?? []).length > 0 && (
                          <div className="text-[10px] text-muted-foreground mt-1">
                            tools:{" "}
                            <span className="font-mono">{(s.tools ?? []).join(", ")}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0"
                          onClick={() => handleEdit(s)}
                          title="Edit"
                        >
                          <Edit3 className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0"
                          onClick={() => removeMut.mutate({ subagentId: s.id })}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
        {label}
      </Label>
      {children}
    </div>
  );
}
