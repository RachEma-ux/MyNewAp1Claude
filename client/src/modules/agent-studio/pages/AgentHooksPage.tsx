/**
 * AI Agent Studio — Hooks Page
 *
 * Lifecycle hooks attached to a draft. Mirrors openllm-agent2's 27 hook
 * events (PreToolUse, PostToolUse, SessionStart, etc.). One row per
 * (event, matcher, command) — when the event fires at runtime, the command
 * is invoked with the event payload.
 *
 * Layout:
 *   left:  Add Hook form
 *   right: Hook list grouped by event name
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
import { Loader2, Plus, Trash2, Webhook } from "lucide-react";
import {
  PageHeader,
  EmptyState,
  LoadingState,
  SectionLabel,
} from "../components/ui";

const HOOK_EVENTS = [
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "Notification",
  "UserPromptSubmit",
  "SessionStart",
  "SessionEnd",
  "Stop",
  "StopFailure",
  "SubagentStart",
  "SubagentStop",
  "PreCompact",
  "PostCompact",
  "PermissionRequest",
  "PermissionDenied",
  "Setup",
  "TeammateIdle",
  "TaskCreated",
  "TaskCompleted",
  "Elicitation",
  "ElicitationResult",
  "ConfigChange",
  "WorktreeCreate",
  "WorktreeRemove",
  "InstructionsLoaded",
  "CwdChanged",
  "FileChanged",
] as const;

/** Event categories for visual grouping */
const EVENT_CATEGORIES: Record<string, string[]> = {
  "Tool Use": ["PreToolUse", "PostToolUse", "PostToolUseFailure"],
  Sessions: ["SessionStart", "SessionEnd", "Stop", "StopFailure"],
  Subagents: ["SubagentStart", "SubagentStop", "TeammateIdle"],
  Compaction: ["PreCompact", "PostCompact"],
  Permissions: ["PermissionRequest", "PermissionDenied"],
  Tasks: ["TaskCreated", "TaskCompleted"],
  Elicitation: ["Elicitation", "ElicitationResult"],
  Worktree: ["WorktreeCreate", "WorktreeRemove"],
  Filesystem: ["FileChanged", "CwdChanged"],
  Other: ["UserPromptSubmit", "Notification", "Setup", "ConfigChange", "InstructionsLoaded"],
};

export default function AgentHooksPage({ agentId }: { agentId: number }) {
  const utils = trpc.useUtils();
  const hooksQuery = trpc.agentStudio.hooks.list.useQuery({ agentId });

  const saveMut = trpc.agentStudio.hooks.save.useMutation({
    onSuccess: () => {
      toast.success("Hook saved");
      utils.agentStudio.hooks.list.invalidate({ agentId });
      utils.agentStudio.shell.getShellSummary.invalidate({ agentId });
      // Reset form
      setNewCommand("");
      setNewMatcher("");
    },
    onError: (e) => toast.error(e.message),
  });

  const removeMut = trpc.agentStudio.hooks.remove.useMutation({
    onSuccess: () => {
      toast.success("Hook removed");
      utils.agentStudio.hooks.list.invalidate({ agentId });
      utils.agentStudio.shell.getShellSummary.invalidate({ agentId });
    },
    onError: (e) => toast.error(e.message),
  });

  // Form state
  const [newEvent, setNewEvent] = useState<string>("PreToolUse");
  const [newMatcher, setNewMatcher] = useState<string>("");
  const [newCommand, setNewCommand] = useState<string>("");
  const [newTimeoutMs, setNewTimeoutMs] = useState<string>("");
  const [newRequiresApproval, setNewRequiresApproval] = useState<boolean>(false);

  if (hooksQuery.isLoading) return <LoadingState label="Loading hooks…" />;

  const hooks = hooksQuery.data ?? [];

  const handleAdd = () => {
    if (!newCommand) return;
    saveMut.mutate({
      agentId,
      eventName: newEvent as any,
      matcher: newMatcher || undefined,
      command: newCommand,
      timeoutMs: newTimeoutMs ? parseInt(newTimeoutMs, 10) : undefined,
      requiresApproval: newRequiresApproval,
    });
  };

  // Group hooks by event for display
  const hooksByEvent = new Map<string, typeof hooks>();
  for (const h of hooks) {
    const arr = hooksByEvent.get(h.eventName) ?? [];
    arr.push(h);
    hooksByEvent.set(h.eventName, arr);
  }

  const supportsMatcher = newEvent === "PreToolUse" || newEvent === "PostToolUse";

  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Hooks"
        subtitle="Lifecycle event hooks — mirrors openllm-agent2's 27 hook events"
        icon={<Webhook className="h-4 w-4" />}
        badges={
          <Badge variant="outline" className="text-[9px] uppercase tracking-wider ml-2">
            {hooks.length} attached · 27 available
          </Badge>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Add Hook form */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <SectionLabel icon={<Plus className="h-3 w-3" />}>
              Attach Hook
            </SectionLabel>

            <Field label="Event">
              <select
                value={newEvent}
                onChange={(e) => setNewEvent(e.target.value)}
                className="h-8 px-2 rounded border bg-background text-xs w-full"
              >
                {Object.entries(EVENT_CATEGORIES).map(([category, events]) => (
                  <optgroup key={category} label={category}>
                    {events.map((event) => (
                      <option key={event} value={event}>
                        {event}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </Field>

            {supportsMatcher && (
              <Field label="Matcher (tool name pattern)">
                <Input
                  value={newMatcher}
                  onChange={(e) => setNewMatcher(e.target.value)}
                  placeholder="e.g. Bash, Write, *"
                  className="h-8 text-xs font-mono"
                />
              </Field>
            )}

            <Field label="Command">
              <Textarea
                value={newCommand}
                onChange={(e) => setNewCommand(e.target.value)}
                placeholder="Shell command or path to hook script"
                className="text-xs min-h-[60px] font-mono"
              />
            </Field>

            <Field label="Timeout (ms, optional)">
              <Input
                type="number"
                min="1"
                value={newTimeoutMs}
                onChange={(e) => setNewTimeoutMs(e.target.value)}
                placeholder="(default)"
                className="h-8 text-xs"
              />
            </Field>

            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={newRequiresApproval}
                onChange={(e) => setNewRequiresApproval(e.target.checked)}
              />
              Requires approval before firing
            </label>

            <Button
              size="sm"
              onClick={handleAdd}
              disabled={!newCommand || saveMut.isPending}
              className="w-full"
            >
              {saveMut.isPending && (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              )}
              Attach Hook
            </Button>
          </CardContent>
        </Card>

        {/* Hook list grouped by event */}
        <Card className="lg:col-span-2">
          <CardContent className="p-4 space-y-3">
            <SectionLabel>Attached Hooks</SectionLabel>

            {hooks.length === 0 ? (
              <EmptyState
                icon={<Webhook className="h-7 w-7" />}
                title="No hooks attached yet"
                description="Hooks fire on lifecycle events like PreToolUse, SessionStart, PermissionDenied. Use the form on the left to attach one."
              />
            ) : (
              <div className="space-y-3">
                {Array.from(hooksByEvent.entries())
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([eventName, eventHooks]) => (
                    <div key={eventName} className="space-y-1">
                      <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/70 border-b pb-1">
                        {eventName}{" "}
                        <span className="text-muted-foreground/40">
                          · {eventHooks.length}
                        </span>
                      </div>
                      <ul className="space-y-1">
                        {eventHooks.map((h: any) => (
                          <li
                            key={h.id}
                            className="border rounded p-2 text-[10px] flex items-start gap-2"
                          >
                            <div className="min-w-0 flex-1">
                              {h.matcher && (
                                <div>
                                  <span className="text-muted-foreground">matcher:</span>{" "}
                                  <code className="font-mono">{h.matcher}</code>
                                </div>
                              )}
                              <pre className="font-mono text-[9px] whitespace-pre-wrap break-all opacity-90 mt-0.5">
                                {h.command}
                              </pre>
                              <div className="flex items-center gap-1 mt-1">
                                {h.timeoutMs && (
                                  <Badge variant="outline" className="text-[9px]">
                                    {h.timeoutMs}ms
                                  </Badge>
                                )}
                                {h.requiresApproval && (
                                  <Badge
                                    variant="outline"
                                    className="text-[9px] border-yellow-500/40 text-yellow-400"
                                  >
                                    requires approval
                                  </Badge>
                                )}
                                {!h.enabled && (
                                  <Badge
                                    variant="outline"
                                    className="text-[9px] border-zinc-500/40 text-zinc-400"
                                  >
                                    disabled
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0 shrink-0"
                              onClick={() => removeMut.mutate({ hookId: h.id })}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
              </div>
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
