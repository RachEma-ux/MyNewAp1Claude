import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CatalogAgentSelect, CatalogLLMSelect } from "@/components/catalog-selectors";
import { useCatalogAvailableAgents, useCatalogAvailableLLMs } from "@/hooks/useCatalogAvailable";
import {
  Bot,
  Plus,
  LayoutDashboard,
  Settings,
  Wand2,
  Activity,
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  XCircle,
  Pause,
  Play,
  Shield,
  Link2,
  Hash,
  MessageSquare,
  Globe,
  Zap,
  Cpu,
  Users,
  FileText,
  CircleDot,
  Loader2,
} from "lucide-react";

// ─── Dashboard Section ───────────────────────────────────────────────

function BotDashboard() {
  const { data: stats, isLoading: statsLoading } = trpc.bots.getStats.useQuery();
  const { data: bots, isLoading: botsLoading } = trpc.bots.list.useQuery();
  const [, navigate] = useLocation();

  const botList = bots || [];
  const total = stats?.total ?? 0;
  const byLifecycle = stats?.byLifecycle ?? {};

  if (total === 0) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Card className="max-w-md w-full text-center">
          <CardHeader className="space-y-4 py-12">
            <Bot className="w-12 h-12 mx-auto text-muted-foreground" />
            <CardTitle className="text-xl">No bots yet</CardTitle>
            <CardDescription>
              Create your first bot to bind agents and LLMs to channels.
            </CardDescription>
            <Button onClick={() => navigate("/bots/wizard")} className="mt-4">
              <Plus className="w-4 h-4 mr-2" />
              Create your first bot
            </Button>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const lifecycleCards = [
    { label: "Draft", count: byLifecycle.draft ?? 0, color: "bg-gray-500/10 text-gray-500" },
    { label: "Bound", count: byLifecycle.bound ?? 0, color: "bg-blue-500/10 text-blue-500" },
    { label: "Reviewed", count: byLifecycle.reviewed ?? 0, color: "bg-yellow-500/10 text-yellow-500" },
    { label: "Approved", count: byLifecycle.approved ?? 0, color: "bg-emerald-500/10 text-emerald-500" },
    { label: "Active", count: byLifecycle.active ?? 0, color: "bg-green-500/10 text-green-500" },
    { label: "Suspended", count: byLifecycle.suspended ?? 0, color: "bg-red-500/10 text-red-500" },
  ];

  const quickActions = [
    { label: "Create Bot", icon: Plus, href: "/bots/wizard", color: "bg-blue-500/10 text-blue-500" },
    { label: "Control Panel", icon: Settings, href: "/bots/control-panel", color: "bg-purple-500/10 text-purple-500" },
    { label: "View Catalog", icon: FileText, href: "/llm/catalogue/manage", color: "bg-cyan-500/10 text-cyan-500" },
  ];

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {lifecycleCards.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">{s.count}</p>
              <Badge variant="secondary" className={`${s.color} mt-1`}>
                {s.label}
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Total */}
      <Card>
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bot className="w-5 h-5 text-primary" />
            <span className="font-semibold">Total Bots</span>
          </div>
          <span className="text-2xl font-bold">{total}</span>
        </CardContent>
      </Card>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {quickActions.map((a) => (
          <Card
            key={a.href}
            className="cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => navigate(a.href)}
          >
            <CardHeader className="p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className={`${a.color} px-2 py-1`}>
                  <a.icon className="w-3.5 h-3.5" />
                </Badge>
                <CardTitle className="text-sm font-semibold">{a.label}</CardTitle>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>

      {/* Recent bots */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Bots</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {botList.slice(0, 10).map((bot: any) => {
            const config = (bot.config as Record<string, any>) || {};
            const lifecycle = config.lifecycleStatus || "draft";
            return (
              <div
                key={bot.id}
                className="flex items-center justify-between py-2 px-3 rounded-md border"
              >
                <div className="flex items-center gap-3">
                  <Bot className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-sm">{bot.displayName || bot.name}</p>
                    <p className="text-xs text-muted-foreground">{bot.description || "No description"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {config.channels?.length > 0 && (
                    <Badge variant="outline" className="text-xs">
                      {config.channels.length} channel{config.channels.length !== 1 ? "s" : ""}
                    </Badge>
                  )}
                  <Badge variant="secondary" className="text-xs capitalize">{lifecycle}</Badge>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Control Panel Section ───────────────────────────────────────────

function BotControlPanel() {
  const { data: bots, isLoading } = trpc.bots.list.useQuery();
  const utils = trpc.useUtils();
  const updateStatus = trpc.bots.updateStatus.useMutation({
    onSuccess: () => {
      utils.bots.list.invalidate();
      utils.bots.getStats.invalidate();
    },
  });
  const [, navigate] = useLocation();

  const botList = bots || [];

  // Lifecycle state machine visualization
  const lifecycleStages = [
    { key: "draft", label: "Draft", icon: FileText },
    { key: "bound", label: "Bound", icon: Link2 },
    { key: "reviewed", label: "Reviewed", icon: Shield },
    { key: "approved", label: "Approved", icon: CheckCircle },
    { key: "active", label: "Active", icon: Play },
    { key: "suspended", label: "Suspended", icon: Pause },
  ];

  if (botList.length === 0) {
    return (
      <div className="space-y-6">
        {/* Lifecycle visualization */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bot Lifecycle</CardTitle>
            <CardDescription>Bots follow this governance lifecycle</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              {lifecycleStages.map((stage, i) => (
                <div key={stage.key} className="flex items-center gap-2">
                  <div className="flex flex-col items-center gap-1 min-w-[80px]">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                      <stage.icon className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <span className="text-xs text-muted-foreground">{stage.label}</span>
                  </div>
                  {i < lifecycleStages.length - 1 && (
                    <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="text-center py-12">
          <CardContent>
            <Bot className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No bots to manage yet.</p>
            <Button onClick={() => navigate("/bots/wizard")} className="mt-4" size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Create Bot
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  function handleStatusChange(botId: number, newStatus: string) {
    updateStatus.mutate({
      id: botId,
      status: newStatus as any,
    });
  }

  return (
    <div className="space-y-6">
      {/* Lifecycle visualization */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bot Lifecycle</CardTitle>
          <CardDescription>Bots follow this governance lifecycle before going live</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {lifecycleStages.map((stage, i) => (
              <div key={stage.key} className="flex items-center gap-2">
                <div className="flex flex-col items-center gap-1 min-w-[80px]">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    <stage.icon className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <span className="text-xs text-muted-foreground">{stage.label}</span>
                </div>
                {i < lifecycleStages.length - 1 && (
                  <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Bot list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Bots</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {botList.map((bot: any) => {
            const config = (bot.config as Record<string, any>) || {};
            const lifecycle = config.lifecycleStatus || "draft";
            const channels: string[] = config.channels || [];
            const agentId = config.agentId;
            const llmId = config.llmId;

            const nextActions: { label: string; status: string; icon: React.ElementType }[] = [];
            if (lifecycle === "draft") nextActions.push({ label: "Mark Bound", status: "bound", icon: Link2 });
            if (lifecycle === "bound") nextActions.push({ label: "Mark Reviewed", status: "reviewed", icon: Shield });
            if (lifecycle === "reviewed") nextActions.push({ label: "Approve", status: "approved", icon: CheckCircle });
            if (lifecycle === "approved") nextActions.push({ label: "Activate", status: "active", icon: Play });
            if (lifecycle === "active") nextActions.push({ label: "Suspend", status: "suspended", icon: Pause });
            if (lifecycle === "suspended") nextActions.push({ label: "Reactivate", status: "active", icon: Play });

            return (
              <div key={bot.id} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Bot className="w-5 h-5 text-primary" />
                    <div>
                      <p className="font-semibold">{bot.displayName || bot.name}</p>
                      <p className="text-xs text-muted-foreground">{bot.description || "—"}</p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="capitalize">{lifecycle}</Badge>
                </div>

                {/* Dependencies */}
                <div className="flex flex-wrap gap-2 text-xs">
                  {agentId && (
                    <Badge variant="outline">
                      <Cpu className="w-3 h-3 mr-1" /> Agent #{agentId}
                    </Badge>
                  )}
                  {llmId && (
                    <Badge variant="outline">
                      <Zap className="w-3 h-3 mr-1" /> LLM #{llmId}
                    </Badge>
                  )}
                  {channels.map((ch) => (
                    <Badge key={ch} variant="outline">
                      <Globe className="w-3 h-3 mr-1" /> {ch}
                    </Badge>
                  ))}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  {nextActions.map((action) => (
                    <Button
                      key={action.status}
                      size="sm"
                      variant="outline"
                      disabled={updateStatus.isPending}
                      onClick={() => handleStatusChange(bot.id, action.status)}
                    >
                      <action.icon className="w-3.5 h-3.5 mr-1" />
                      {action.label}
                    </Button>
                  ))}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Bot Register / Wizard Section ───────────────────────────────────

const WIZARD_STEPS = [
  { key: "identity", label: "Identity", icon: Hash },
  { key: "agent", label: "Agent Binding", icon: Cpu },
  { key: "llm", label: "LLM Binding", icon: Zap },
  { key: "channels", label: "Channels", icon: Globe },
  { key: "behavior", label: "Behavior", icon: MessageSquare },
  { key: "scope", label: "Scope & Permissions", icon: Shield },
  { key: "review", label: "Review & Create", icon: CheckCircle },
] as const;

const CHANNEL_OPTIONS = [
  { value: "web", label: "Web Widget" },
  { value: "api", label: "REST API" },
  { value: "slack", label: "Slack" },
  { value: "discord", label: "Discord" },
  { value: "teams", label: "Microsoft Teams" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "telegram", label: "Telegram" },
  { value: "email", label: "Email" },
];

interface BotFormData {
  name: string;
  displayName: string;
  description: string;
  agentId: number | null;
  llmId: number | null;
  channels: string[];
  systemPrompt: string;
  persona: string;
  responseStyle: string;
  scope: "app" | "workspace" | "org";
  rateLimit: number;
}

function BotWizard() {
  const [step, setStep] = useState(0);
  const [, navigate] = useLocation();
  const [form, setForm] = useState<BotFormData>({
    name: "",
    displayName: "",
    description: "",
    agentId: null,
    llmId: null,
    channels: [],
    systemPrompt: "",
    persona: "",
    responseStyle: "balanced",
    scope: "app",
    rateLimit: 60,
  });

  // Catalog-backed selectors: only approved+active assets from Catalog
  const { options: agentOptions, isLoading: agentsLoading } = useCatalogAvailableAgents();
  const { options: llmOptions, isLoading: llmsLoading } = useCatalogAvailableLLMs();
  const utils = trpc.useUtils();

  const createBot = trpc.bots.create.useMutation({
    onSuccess: () => {
      utils.bots.list.invalidate();
      utils.bots.getStats.invalidate();
      navigate("/bots/dashboard");
    },
  });

  const currentStep = WIZARD_STEPS[step];

  function next() {
    if (step < WIZARD_STEPS.length - 1) setStep(step + 1);
  }
  function prev() {
    if (step > 0) setStep(step - 1);
  }

  function toggleChannel(ch: string) {
    setForm((f) => ({
      ...f,
      channels: f.channels.includes(ch) ? f.channels.filter((c) => c !== ch) : [...f.channels, ch],
    }));
  }

  function handleCreate() {
    createBot.mutate({
      name: form.name,
      displayName: form.displayName || form.name,
      description: form.description || undefined,
      agentId: form.agentId ?? undefined,
      llmId: form.llmId ?? undefined,
      channels: form.channels.length > 0 ? form.channels : undefined,
      behaviorConfig: {
        systemPrompt: form.systemPrompt || undefined,
        persona: form.persona || undefined,
        responseStyle: form.responseStyle || undefined,
      },
      scope: form.scope,
      rateLimit: form.rateLimit > 0 ? form.rateLimit : undefined,
    });
  }

  const canProceed = (() => {
    if (step === 0) return form.name.trim().length > 0;
    return true;
  })();

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {WIZARD_STEPS.map((s, i) => (
          <div key={s.key} className="flex items-center gap-1">
            <button
              onClick={() => i <= step && setStep(i)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                i === step
                  ? "bg-primary text-primary-foreground"
                  : i < step
                    ? "bg-primary/20 text-primary cursor-pointer"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              <s.icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{s.label}</span>
              <span className="sm:hidden">{i + 1}</span>
            </button>
            {i < WIZARD_STEPS.length - 1 && (
              <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <currentStep.icon className="w-4 h-4" />
            {currentStep.label}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Step 1: Identity */}
          {step === 0 && (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">Bot Name *</label>
                <Input
                  placeholder="my-support-bot"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Display Name</label>
                <Input
                  placeholder="Customer Support Bot"
                  value={form.displayName}
                  onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Description</label>
                <Textarea
                  placeholder="What does this bot do?"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                />
              </div>
            </>
          )}

          {/* Step 2: Agent Binding (Catalog-backed) */}
          {step === 1 && (
            <>
              <p className="text-sm text-muted-foreground">
                Select an agent to power this bot. Only Catalog-available agents are shown.
              </p>
              <CatalogAgentSelect
                value={form.agentId ? String(form.agentId) : "none"}
                onValueChange={(v) => setForm({ ...form, agentId: v === "none" ? null : Number(v) })}
                allowNone
                noneLabel="No agent (configure later)"
                searchable={agentOptions.length > 5}
              />
              {form.agentId && (
                <Badge variant="secondary">
                  <Cpu className="w-3 h-3 mr-1" /> Agent #{form.agentId} bound
                </Badge>
              )}
            </>
          )}

          {/* Step 3: LLM Binding (Catalog-backed) */}
          {step === 2 && (
            <>
              <p className="text-sm text-muted-foreground">
                Optionally override the agent's default LLM. Only Catalog-available LLMs are shown.
              </p>
              <CatalogLLMSelect
                value={form.llmId ? String(form.llmId) : "none"}
                onValueChange={(v) => setForm({ ...form, llmId: v === "none" ? null : Number(v) })}
                allowNone
                noneLabel="Use agent default"
                searchable={llmOptions.length > 5}
              />
              {form.llmId && (
                <Badge variant="secondary">
                  <Zap className="w-3 h-3 mr-1" /> LLM #{form.llmId} selected
                </Badge>
              )}
            </>
          )}

          {/* Step 4: Channels */}
          {step === 3 && (
            <>
              <p className="text-sm text-muted-foreground">
                Select the channels where this bot will be available.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {CHANNEL_OPTIONS.map((ch) => (
                  <button
                    key={ch.value}
                    onClick={() => toggleChannel(ch.value)}
                    className={`flex items-center gap-2 p-3 rounded-lg border text-sm transition-colors ${
                      form.channels.includes(ch.value)
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <Globe className="w-4 h-4" />
                    {ch.label}
                  </button>
                ))}
              </div>
              {form.channels.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {form.channels.map((ch) => (
                    <Badge key={ch} variant="secondary" className="text-xs capitalize">
                      {ch}
                    </Badge>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Step 5: Behavior */}
          {step === 4 && (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">System Prompt</label>
                <Textarea
                  placeholder="You are a helpful customer support assistant..."
                  value={form.systemPrompt}
                  onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
                  rows={4}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Persona</label>
                <Input
                  placeholder="Friendly, professional, concise"
                  value={form.persona}
                  onChange={(e) => setForm({ ...form, persona: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Response Style</label>
                <Select
                  value={form.responseStyle}
                  onValueChange={(v) => setForm({ ...form, responseStyle: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="concise">Concise</SelectItem>
                    <SelectItem value="balanced">Balanced</SelectItem>
                    <SelectItem value="detailed">Detailed</SelectItem>
                    <SelectItem value="technical">Technical</SelectItem>
                    <SelectItem value="conversational">Conversational</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* Step 6: Scope & Permissions */}
          {step === 5 && (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">Scope</label>
                <Select
                  value={form.scope}
                  onValueChange={(v) => setForm({ ...form, scope: v as any })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="app">App-wide</SelectItem>
                    <SelectItem value="workspace">Workspace</SelectItem>
                    <SelectItem value="org">Organization</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Rate Limit (requests/min)</label>
                <Input
                  type="number"
                  min={1}
                  max={10000}
                  value={form.rateLimit}
                  onChange={(e) => setForm({ ...form, rateLimit: Number(e.target.value) || 60 })}
                />
              </div>
            </>
          )}

          {/* Step 7: Review & Create */}
          {step === 6 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Name</p>
                  <p className="font-medium">{form.name || "—"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Display Name</p>
                  <p className="font-medium">{form.displayName || form.name || "—"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Description</p>
                  <p className="font-medium">{form.description || "—"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Agent</p>
                  <p className="font-medium">{form.agentId ? `Agent #${form.agentId}` : "Not bound"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">LLM</p>
                  <p className="font-medium">{form.llmId ? `LLM #${form.llmId}` : "Agent default"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Channels</p>
                  <div className="flex flex-wrap gap-1">
                    {form.channels.length > 0
                      ? form.channels.map((ch) => (
                          <Badge key={ch} variant="outline" className="text-xs capitalize">
                            {ch}
                          </Badge>
                        ))
                      : <span className="text-muted-foreground text-sm">None selected</span>}
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Response Style</p>
                  <p className="font-medium capitalize">{form.responseStyle}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Scope</p>
                  <p className="font-medium capitalize">{form.scope}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Rate Limit</p>
                  <p className="font-medium">{form.rateLimit} req/min</p>
                </div>
              </div>

              {form.systemPrompt && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">System Prompt</p>
                  <pre className="text-sm bg-muted p-3 rounded-md whitespace-pre-wrap">
                    {form.systemPrompt}
                  </pre>
                </div>
              )}

              {createBot.isError && (
                <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm">
                  {(createBot.error as any)?.message || "Failed to create bot"}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="outline" disabled={step === 0} onClick={prev}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>

        {step < WIZARD_STEPS.length - 1 ? (
          <Button onClick={next} disabled={!canProceed}>
            Next
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        ) : (
          <Button onClick={handleCreate} disabled={createBot.isPending || !form.name.trim()}>
            {createBot.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle className="w-4 h-4 mr-2" />
            )}
            Create Bot
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Main Page (routes by section) ───────────────────────────────────

const sectionMeta: Record<string, { title: string; description: string; icon: React.ElementType }> = {
  dashboard: { title: "Bot Dashboard", description: "Overview of all bots, stats, and quick actions", icon: LayoutDashboard },
  "control-panel": { title: "Bot Control Panel", description: "Lifecycle management and governance controls", icon: Settings },
  wizard: { title: "Bot Register", description: "Create a new governed bot", icon: Wand2 },
};

export default function BotsComingSoonPage() {
  const [, params] = useRoute("/bots/:section");
  const section = params?.section ?? "dashboard";
  const meta = sectionMeta[section] ?? sectionMeta.dashboard;
  const Icon = meta.icon;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <Icon className="w-6 h-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">{meta.title}</h1>
          <p className="text-muted-foreground mt-1">{meta.description}</p>
        </div>
      </div>

      {section === "dashboard" && <BotDashboard />}
      {section === "control-panel" && <BotControlPanel />}
      {section === "wizard" && <BotWizard />}
    </div>
  );
}
