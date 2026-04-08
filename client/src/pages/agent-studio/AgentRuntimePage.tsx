/**
 * AI Agent Studio — Runtime Configuration Page
 *
 * Surfaces the 8 new draft columns from Phase 0a:
 *   - effort, maxTurns, background, initialPrompt, criticalSystemReminder
 *   - permissionMode, workingDirectories, providerConfig
 *
 * These are the openllm-agent2 native runtime fields. Identity stays about
 * "who", this page is about "how the agent runs".
 */
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Loader2,
  Cpu,
  Plus,
  X,
  ShieldCheck,
  KeyRound,
  CalendarClock,
} from "lucide-react";
import {
  PageHeader,
  LoadingState,
  SectionLabel,
} from "@/components/agent-studio/ui";

const PERMISSION_MODE_OPTIONS = [
  { value: "default", label: "Default — prompt for dangerous operations" },
  { value: "acceptEdits", label: "Accept Edits — auto-accept file edits" },
  {
    value: "bypassPermissions",
    label: "Bypass — skip all checks (requires unsafe flag)",
  },
  { value: "plan", label: "Plan — planning mode, no tool execution" },
  { value: "dontAsk", label: "Don't Ask — deny if not pre-approved" },
];

const PROVIDER_OPTIONS = [
  { value: "ollama", label: "Ollama (local, free)" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "gemini", label: "Google Gemini" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "groq", label: "Groq (free tier)" },
  { value: "together", label: "Together" },
  { value: "fireworks", label: "Fireworks" },
  { value: "mistral", label: "Mistral" },
  { value: "openrouter", label: "OpenRouter (200+ models)" },
  { value: "github_models", label: "GitHub Models" },
  { value: "lmstudio", label: "LM Studio (local, free)" },
  { value: "bedrock", label: "AWS Bedrock" },
  { value: "vertex", label: "Google Vertex" },
  { value: "atomic_chat", label: "Atomic Chat (Apple Silicon)" },
];

const EFFORT_OPTIONS = [
  { value: "", label: "(inherit)" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "max", label: "Max" },
];

export default function AgentRuntimePage({ agentId }: { agentId: number }) {
  const utils = trpc.useUtils();
  const query = trpc.agentStudio.runtime.get.useQuery({ agentId });
  const updateMut = trpc.agentStudio.runtime.update.useMutation({
    onSuccess: () => {
      toast.success("Runtime config saved");
      utils.agentStudio.runtime.get.invalidate({ agentId });
      utils.agentStudio.shell.getShellSummary.invalidate({ agentId });
    },
    onError: (e) => toast.error(e.message),
  });

  // Form state
  const [effort, setEffort] = useState<string>("");
  const [maxTurns, setMaxTurns] = useState<string>("");
  const [background, setBackground] = useState<boolean>(false);
  const [initialPrompt, setInitialPrompt] = useState<string>("");
  const [criticalSystemReminder, setCriticalSystemReminder] = useState<string>("");
  const [permissionMode, setPermissionMode] = useState<string>("");
  const [workingDirsInput, setWorkingDirsInput] = useState<string>("");
  const [provider, setProvider] = useState<string>("");
  const [model, setModel] = useState<string>("");
  const [apiKey, setApiKey] = useState<string>("");
  const [baseUrl, setBaseUrl] = useState<string>("");
  // Phase 12: presentation
  const [outputStyle, setOutputStyle] = useState<string>("");
  const [theme, setTheme] = useState<string>("");
  const [statusShowModel, setStatusShowModel] = useState<boolean>(true);
  const [statusShowCost, setStatusShowCost] = useState<boolean>(true);
  const [statusShowTime, setStatusShowTime] = useState<boolean>(true);
  const [statusCustomText, setStatusCustomText] = useState<string>("");

  useEffect(() => {
    if (query.data) {
      const d = query.data;
      setEffort(d.effort ?? "");
      setMaxTurns(d.maxTurns != null ? String(d.maxTurns) : "");
      setBackground(!!d.background);
      setInitialPrompt(d.initialPrompt ?? "");
      setCriticalSystemReminder(d.criticalSystemReminder ?? "");
      setPermissionMode(d.permissionMode ?? "");
      setWorkingDirsInput((d.workingDirectories ?? []).join("\n"));
      const pc = (d.providerConfig ?? {}) as Record<string, unknown>;
      setProvider((pc.provider as string) ?? "");
      setModel((pc.model as string) ?? "");
      // We never display the apiKey value from the server — it's masked.
      // The field stays empty unless the user types a new key.
      setApiKey("");
      setBaseUrl((pc.baseUrl as string) ?? "");
      // Phase 12: presentation
      setOutputStyle((d as any).outputStyle ?? "");
      setTheme((d as any).theme ?? "");
      const slc = ((d as any).statusLineConfig ?? {}) as Record<string, unknown>;
      setStatusShowModel(slc.showModel !== false);
      setStatusShowCost(slc.showCost !== false);
      setStatusShowTime(slc.showTime !== false);
      setStatusCustomText((slc.customText as string) ?? "");
    }
  }, [query.data]);

  if (query.isLoading) return <LoadingState label="Loading runtime config…" />;

  const handleSave = () => {
    const workingDirectories = workingDirsInput
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    // Build providerConfig — only include apiKey if the user typed a new value
    const providerConfig: Record<string, unknown> = {};
    if (provider) providerConfig.provider = provider;
    if (model) providerConfig.model = model;
    if (baseUrl) providerConfig.baseUrl = baseUrl;
    if (apiKey) providerConfig.apiKey = apiKey;

    // Phase 12: build statusLineConfig from the toggles
    const statusLineConfig: Record<string, unknown> = {
      showModel: statusShowModel,
      showCost: statusShowCost,
      showTime: statusShowTime,
    };
    if (statusCustomText) statusLineConfig.customText = statusCustomText;

    updateMut.mutate({
      agentId,
      effort: effort || null,
      maxTurns: maxTurns ? parseInt(maxTurns, 10) : null,
      background,
      initialPrompt: initialPrompt || null,
      criticalSystemReminder: criticalSystemReminder || null,
      permissionMode: (permissionMode || null) as any,
      workingDirectories,
      providerConfig,
      // Phase 12: presentation
      outputStyle: (outputStyle || null) as any,
      statusLineConfig,
      theme: (theme || null) as any,
    });
  };

  const existingProviderConfig = (query.data?.providerConfig ?? {}) as Record<
    string,
    unknown
  >;
  const hasExistingApiKey = !!existingProviderConfig.apiKey;

  return (
    <div className="p-4 space-y-4 max-w-4xl">
      <PageHeader
        title="Runtime"
        subtitle="How the agent executes — provider, model, effort, working directories, permission mode"
        icon={<Cpu className="h-4 w-4" />}
      />

      {/* Provider / Model / API Key */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <SectionLabel icon={<KeyRound className="h-3 w-3" />}>
            Provider &amp; Model
          </SectionLabel>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Provider">
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="h-8 px-2 rounded border bg-background text-xs w-full"
              >
                <option value="">(inherit / unset)</option>
                {PROVIDER_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Model alias or full ID">
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="e.g. gpt-4o-mini, claude-sonnet-4-5, sonnet"
                className="h-8 text-xs font-mono"
              />
            </Field>

            <Field label="Base URL (optional, for custom endpoints)">
              <Input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.openai.com/v1"
                className="h-8 text-xs font-mono"
              />
            </Field>

            <Field
              label={
                hasExistingApiKey
                  ? "API Key (set — leave blank to keep)"
                  : "API Key"
              }
            >
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={hasExistingApiKey ? "••••••••" : "sk-…"}
                className="h-8 text-xs font-mono"
                autoComplete="off"
              />
            </Field>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Stored in <code className="font-mono">draft.providerConfig</code>.
            Phase 1 will encrypt the key at rest via the platform encryption
            helpers; until then keys are stored in plaintext jsonb — only set
            non-sensitive test keys here.
          </p>
        </CardContent>
      </Card>

      {/* Reasoning + Execution */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <SectionLabel>Reasoning &amp; Execution</SectionLabel>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Effort">
              <select
                value={effort}
                onChange={(e) => setEffort(e.target.value)}
                className="h-8 px-2 rounded border bg-background text-xs w-full"
              >
                {EFFORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Max turns (agentic round-trips)">
              <Input
                type="number"
                min="1"
                value={maxTurns}
                onChange={(e) => setMaxTurns(e.target.value)}
                placeholder="(unlimited)"
                className="h-8 text-xs"
              />
            </Field>

            <Field label="Background mode">
              <label className="flex items-center gap-2 text-xs h-8">
                <input
                  type="checkbox"
                  checked={background}
                  onChange={(e) => setBackground(e.target.checked)}
                />
                Run as fire-and-forget background task
              </label>
            </Field>
          </div>
        </CardContent>
      </Card>

      {/* Permission Mode + Working Directories */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <SectionLabel icon={<ShieldCheck className="h-3 w-3" />}>
            Permission Mode &amp; Working Directories
          </SectionLabel>

          <Field label="Permission mode">
            <select
              value={permissionMode}
              onChange={(e) => setPermissionMode(e.target.value)}
              className="h-8 px-2 rounded border bg-background text-xs w-full"
            >
              <option value="">(inherit)</option>
              {PERMISSION_MODE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Working directories (one per line — addDirectories permission)">
            <Textarea
              value={workingDirsInput}
              onChange={(e) => setWorkingDirsInput(e.target.value)}
              placeholder="/workspace&#10;/data/imports"
              className="text-xs min-h-[80px] font-mono"
            />
          </Field>
        </CardContent>
      </Card>

      {/* Initial prompt + Critical reminder */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <SectionLabel>Initial Prompt &amp; Critical Reminder</SectionLabel>

          <Field label="Initial prompt (auto-submitted as the first user turn)">
            <Textarea
              value={initialPrompt}
              onChange={(e) => setInitialPrompt(e.target.value)}
              className="text-xs min-h-[80px]"
            />
          </Field>

          <Field label="Critical system reminder (experimental — appended to system prompt)">
            <Textarea
              value={criticalSystemReminder}
              onChange={(e) => setCriticalSystemReminder(e.target.value)}
              className="text-xs min-h-[80px]"
            />
            <p className="text-[10px] text-muted-foreground mt-0.5">
              <Badge variant="outline" className="text-[9px] mr-1">
                experimental
              </Badge>
              Mirrors openllm-agent2's <code className="font-mono">criticalSystemReminder_EXPERIMENTAL</code> field.
            </p>
          </Field>
        </CardContent>
      </Card>

      {/* Phase 12: Presentation — output style + status line + theme */}
      <Card>
        <CardContent className="p-3 space-y-3">
          <SectionLabel icon={<Cpu className="h-3 w-3 text-cyan-500" />}>
            Presentation — output style, status line, theme
          </SectionLabel>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Output style">
              <select
                value={outputStyle}
                onChange={(e) => setOutputStyle(e.target.value)}
                className="h-7 px-2 rounded border bg-background text-xs w-full"
              >
                <option value="">(inherit / plain)</option>
                <option value="plain">Plain text</option>
                <option value="markdown">Markdown</option>
                <option value="json">JSON</option>
              </select>
            </Field>
            <Field label="Theme">
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                className="h-7 px-2 rounded border bg-background text-xs w-full"
              >
                <option value="">(inherit)</option>
                <option value="dark">Dark</option>
                <option value="light">Light</option>
                <option value="monokai">Monokai</option>
              </select>
            </Field>
            <Field label="Status custom text">
              <Input
                value={statusCustomText}
                onChange={(e) => setStatusCustomText(e.target.value)}
                placeholder="(optional suffix)"
                className="h-7 text-xs"
              />
            </Field>
          </div>
          <div className="flex flex-wrap gap-3 text-[10px]">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={statusShowModel}
                onChange={(e) => setStatusShowModel(e.target.checked)}
              />
              Show model in status line
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={statusShowCost}
                onChange={(e) => setStatusShowCost(e.target.checked)}
              />
              Show cost in status line
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={statusShowTime}
                onChange={(e) => setStatusShowTime(e.target.checked)}
              />
              Show time in status line
            </label>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={updateMut.isPending}>
          {updateMut.isPending && (
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          )}
          Save Runtime Config
        </Button>
      </div>

      {/* Phase 10: Schedule section */}
      <ScheduleSection agentId={agentId} />
    </div>
  );
}

/**
 * Phase 10: Cron schedule editor. Independent of the main runtime form
 * because it has its own save flow (separate setSchedule mutation) and
 * its own loading lifecycle.
 */
function ScheduleSection({ agentId }: { agentId: number }) {
  const utils = trpc.useUtils();
  const scheduleQuery = trpc.agentStudio.runtime.getSchedule.useQuery({ agentId });
  const setScheduleMut = trpc.agentStudio.runtime.setSchedule.useMutation({
    onSuccess: () => {
      toast.success("Schedule saved");
      utils.agentStudio.runtime.getSchedule.invalidate({ agentId });
    },
    onError: (e) => toast.error(e.message),
  });

  const [enabled, setEnabled] = useState<boolean>(false);
  const [cron, setCron] = useState<string>("");
  const [timezone, setTimezone] = useState<string>("UTC");
  const [payloadStr, setPayloadStr] = useState<string>("{}");

  useEffect(() => {
    if (scheduleQuery.data) {
      const d = scheduleQuery.data as any;
      setEnabled(d.enabled === true);
      setCron(typeof d.cron === "string" ? d.cron : "");
      setTimezone(typeof d.timezone === "string" ? d.timezone : "UTC");
      setPayloadStr(
        d.payload && typeof d.payload === "object"
          ? JSON.stringify(d.payload, null, 2)
          : "{}"
      );
    }
  }, [scheduleQuery.data]);

  function handleSaveSchedule() {
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(payloadStr || "{}");
    } catch (e) {
      toast.error("Payload must be valid JSON");
      return;
    }
    setScheduleMut.mutate({
      agentId,
      enabled,
      cron: cron.trim(),
      timezone: timezone.trim() || "UTC",
      payload,
    });
  }

  return (
    <Card>
      <CardContent className="p-3 space-y-3">
        <SectionLabel icon={<CalendarClock className="h-3 w-3 text-cyan-500" />}>
          Schedule — fires this agent on a cron schedule (60s tick)
        </SectionLabel>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Enabled">
            <select
              value={enabled ? "1" : "0"}
              onChange={(e) => setEnabled(e.target.value === "1")}
              className="h-7 px-2 rounded border bg-background text-xs w-full"
            >
              <option value="0">Disabled</option>
              <option value="1">Enabled</option>
            </select>
          </Field>
          <Field label="Cron expression (UTC)">
            <Input
              placeholder="*/5 * * * *  (every 5 min)"
              value={cron}
              onChange={(e) => setCron(e.target.value)}
              className="h-7 text-xs font-mono"
            />
          </Field>
          <Field label="Timezone (display only)">
            <Input
              placeholder="UTC"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="h-7 text-xs"
            />
          </Field>
        </div>
        <Field label="Payload (JSON, passed to runSimulation)">
          <Textarea
            value={payloadStr}
            onChange={(e) => setPayloadStr(e.target.value)}
            className="text-[10px] font-mono min-h-[60px]"
            placeholder='{ "prompt": "Hello" }'
          />
        </Field>
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={handleSaveSchedule}
            disabled={setScheduleMut.isPending}
          >
            {setScheduleMut.isPending && (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            )}
            Save Schedule
          </Button>
        </div>
      </CardContent>
    </Card>
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
