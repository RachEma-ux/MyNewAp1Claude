/**
 * Code Studio — OpenCode Settings Page
 *
 * Comprehensive settings surface for managing the OpenCode runtime configuration.
 * Left section nav + center config editor + right status drawer + bottom action bar.
 */
import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Loader2,
  Save,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Eye,
  Play,
  RotateCcw,
  Activity,
  Server,
  Shield,
  Cpu,
  Terminal,
  Palette,
  Settings2,
  Plug,
  Bot,
  FileCode,
  Keyboard,
  FlaskConical,
  ScrollText,
  ChevronRight,
  RefreshCw,
  Heart,
  Code2,
  Braces,
} from "lucide-react";

// ── Section definitions ──────────────────────────────────────────────────────

type SettingsSection =
  | "overview"
  | "runtime"
  | "server"
  | "providers"
  | "tools"
  | "agents"
  | "permissions"
  | "commands"
  | "formatters"
  | "mcp-plugins"
  | "instructions"
  | "tui"
  | "advanced"
  | "status";

const SECTIONS: { key: SettingsSection; label: string; icon: React.ElementType }[] = [
  { key: "overview", label: "Overview", icon: Settings2 },
  { key: "runtime", label: "Runtime", icon: Cpu },
  { key: "server", label: "Server", icon: Server },
  { key: "providers", label: "Providers & Models", icon: Plug },
  { key: "agents", label: "Agents", icon: Bot },
  { key: "permissions", label: "Permissions", icon: Shield },
  { key: "commands", label: "Commands", icon: Terminal },
  { key: "formatters", label: "Formatters", icon: FileCode },
  { key: "mcp-plugins", label: "MCP & Plugins", icon: Braces },
  { key: "instructions", label: "Instructions & Watcher", icon: ScrollText },
  { key: "tui", label: "TUI", icon: Palette },
  { key: "advanced", label: "Advanced", icon: FlaskConical },
  { key: "status", label: "Runtime Status", icon: Heart },
];

// ── Default configs ──────────────────────────────────────────────────────────

const DEFAULT_RUNTIME: Record<string, any> = {
  logLevel: "INFO",
  model: "",
  small_model: "",
  default_agent: "build",
  share: "manual",
  snapshot: true,
  autoupdate: true,
  server: { port: 4096, hostname: "127.0.0.1", mdns: false, mdnsDomain: "opencode.local", cors: [] },
  provider: {},
  agent: {},
  permission: {},
  command: {},
  formatter: {},
  compaction: { auto: true, prune: true, reserved: 10000 },
  watcher: { ignore: [] },
  mcp: {},
  plugin: [],
  instructions: [],
  disabled_providers: [],
  enabled_providers: [],
  skills: { paths: [], urls: [] },
  experimental: {},
};

const DEFAULT_TUI: Record<string, any> = {
  theme: "",
  diff_style: "auto",
  scroll_speed: 1,
  scroll_acceleration: { enabled: false },
  keybinds: {},
  plugin: [],
  plugin_enabled: {},
};

export default function CodeStudioOpenCodeSettingsPage() {
  const [activeSection, setActiveSection] = useState<SettingsSection>("overview");
  const [activeTab, setActiveTab] = useState<"runtime" | "tui">("runtime");
  const [runtimeDraft, setRuntimeDraft] = useState<Record<string, any>>({ ...DEFAULT_RUNTIME });
  const [tuiDraft, setTuiDraft] = useState<Record<string, any>>({ ...DEFAULT_TUI });
  const [previewOpen, setPreviewOpen] = useState(false);
  const [statusDrawerOpen, setStatusDrawerOpen] = useState(false);
  const [jsonEditorOpen, setJsonEditorOpen] = useState(false);
  const [jsonEditorValue, setJsonEditorValue] = useState("");
  const [jsonEditorSection, setJsonEditorSection] = useState("");
  const [dirty, setDirty] = useState(false);

  // ── Queries ──────────────────────────────────────────────────────────────

  const utils = trpc.useUtils();

  const runtimeProfileQuery = trpc.codeStudio.opencodeSettings.profiles.getActive.useQuery(
    { profileType: "runtime" },
  );
  const tuiProfileQuery = trpc.codeStudio.opencodeSettings.profiles.getActive.useQuery(
    { profileType: "tui" },
  );
  const runtimeStatusQuery = trpc.codeStudio.opencodeSettings.runtimeStatus.full.useQuery();
  const applyEventsQuery = trpc.codeStudio.opencodeSettings.applyFlow.events.useQuery({ limit: 10 });

  // ── Mutations ──────────────────────────────────────────────────────────

  const createProfileMut = trpc.codeStudio.opencodeSettings.profiles.create.useMutation({
    onSuccess: () => {
      utils.codeStudio.opencodeSettings.profiles.getActive.invalidate();
      toast.success("Profile created");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateDraftMut = trpc.codeStudio.opencodeSettings.profiles.updateDraft.useMutation({
    onSuccess: () => {
      utils.codeStudio.opencodeSettings.profiles.getActive.invalidate();
      setDirty(false);
      toast.success("Draft saved");
    },
    onError: (e) => toast.error(e.message),
  });

  const validateMut = trpc.codeStudio.opencodeSettings.validation.validateRuntime.useMutation();
  const validateTuiMut = trpc.codeStudio.opencodeSettings.validation.validateTui.useMutation();

  const applyMut = trpc.codeStudio.opencodeSettings.applyFlow.apply.useMutation({
    onSuccess: (data) => {
      utils.codeStudio.opencodeSettings.profiles.getActive.invalidate();
      utils.codeStudio.opencodeSettings.runtimeStatus.full.invalidate();
      utils.codeStudio.opencodeSettings.applyFlow.events.invalidate();
      if (data.success) {
        toast.success("Config applied successfully");
      } else {
        toast.error("Apply failed — check validation errors");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Load profile data into drafts ──────────────────────────────────────

  useEffect(() => {
    if (runtimeProfileQuery.data?.configDraft) {
      setRuntimeDraft({ ...DEFAULT_RUNTIME, ...(runtimeProfileQuery.data.configDraft as Record<string, any>) });
    }
  }, [runtimeProfileQuery.data]);

  useEffect(() => {
    if (tuiProfileQuery.data?.configDraft) {
      setTuiDraft({ ...DEFAULT_TUI, ...(tuiProfileQuery.data.configDraft as Record<string, any>) });
    }
  }, [tuiProfileQuery.data]);

  // ── Helpers ────────────────────────────────────────────────────────────

  const currentDraft = activeTab === "runtime" ? runtimeDraft : tuiDraft;
  const currentProfile = activeTab === "runtime" ? runtimeProfileQuery.data : tuiProfileQuery.data;

  const updateField = useCallback((path: string, value: any) => {
    const setter = activeTab === "runtime" ? setRuntimeDraft : setTuiDraft;
    setter((prev) => {
      const next = { ...prev };
      const parts = path.split(".");
      let obj: any = next;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!obj[parts[i]] || typeof obj[parts[i]] !== "object") {
          obj[parts[i]] = {};
        } else {
          obj[parts[i]] = { ...obj[parts[i]] };
        }
        obj = obj[parts[i]];
      }
      obj[parts[parts.length - 1]] = value;
      return next;
    });
    setDirty(true);
  }, [activeTab]);

  const ensureProfile = useCallback(async () => {
    if (!currentProfile) {
      await createProfileMut.mutateAsync({
        profileType: activeTab,
        name: activeTab === "runtime" ? "Default Runtime Profile" : "Default TUI Profile",
        configDraft: activeTab === "runtime" ? runtimeDraft : tuiDraft,
      });
    }
  }, [currentProfile, activeTab, runtimeDraft, tuiDraft, createProfileMut]);

  const handleSave = useCallback(async () => {
    await ensureProfile();
    const profile = activeTab === "runtime" ? runtimeProfileQuery.data : tuiProfileQuery.data;
    if (profile) {
      await updateDraftMut.mutateAsync({
        id: profile.id,
        configDraft: activeTab === "runtime" ? runtimeDraft : tuiDraft,
      });
    }
  }, [ensureProfile, activeTab, runtimeProfileQuery.data, tuiProfileQuery.data, runtimeDraft, tuiDraft, updateDraftMut]);

  const handleValidate = useCallback(async () => {
    const mut = activeTab === "runtime" ? validateMut : validateTuiMut;
    const result = await mut.mutateAsync({ config: currentDraft });
    if (result.valid) {
      toast.success("Validation passed");
    } else {
      toast.error(`${result.errors.length} validation error(s) found`);
    }
    return result;
  }, [activeTab, currentDraft, validateMut, validateTuiMut]);

  const handleApply = useCallback(async () => {
    await handleSave();
    const profile = activeTab === "runtime" ? runtimeProfileQuery.data : tuiProfileQuery.data;
    if (!profile) {
      toast.error("No profile to apply");
      return;
    }
    await applyMut.mutateAsync({ profileId: profile.id, changeSummary: "Applied from UI" });
  }, [handleSave, activeTab, runtimeProfileQuery.data, tuiProfileQuery.data, applyMut]);

  const openJsonEditor = useCallback((section: string, value: any) => {
    setJsonEditorSection(section);
    setJsonEditorValue(JSON.stringify(value ?? {}, null, 2));
    setJsonEditorOpen(true);
  }, []);

  const saveJsonEditor = useCallback(() => {
    try {
      const parsed = JSON.parse(jsonEditorValue);
      updateField(jsonEditorSection, parsed);
      setJsonEditorOpen(false);
      toast.success(`${jsonEditorSection} updated from JSON editor`);
    } catch {
      toast.error("Invalid JSON");
    }
  }, [jsonEditorValue, jsonEditorSection, updateField]);

  // ── Status data ────────────────────────────────────────────────────────

  const status = runtimeStatusQuery.data;
  const events = applyEventsQuery.data ?? [];

  // ── Section renderers ──────────────────────────────────────────────────

  const renderOverview = () => (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">OpenCode Settings Overview</h3>
      <p className="text-xs text-muted-foreground">
        Configure the OpenCode runtime used by Code Studio. Edit runtime and TUI settings,
        validate configurations, preview generated config files, and apply changes to the runtime.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-xs font-medium mb-2">
              <Cpu className="h-3.5 w-3.5 text-violet-500" /> Runtime Profile
            </div>
            <div className="text-xs text-muted-foreground">
              {currentProfile ? (
                <>
                  <div>{currentProfile.name}</div>
                  <div>Status: <Badge variant={currentProfile.status === "applied" ? "default" : "secondary"} className="text-[9px] ml-1">{currentProfile.status}</Badge></div>
                  {currentProfile.appliedVersion && <div>Version: {currentProfile.appliedVersion}</div>}
                </>
              ) : (
                <span>No profile yet. Save to create one.</span>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-xs font-medium mb-2">
              <Heart className="h-3.5 w-3.5 text-emerald-500" /> Runtime Health
            </div>
            <div className="text-xs text-muted-foreground">
              {status ? (
                <>
                  <div className="flex items-center gap-1">
                    OpenCode: <Badge variant={status.opencode.healthy ? "default" : "destructive"} className="text-[9px]">{status.opencode.healthy ? "Online" : "Offline"}</Badge>
                  </div>
                  {status.opencode.version && <div>Version: {status.opencode.version}</div>}
                  <div>Agents: {status.agents} | Sessions: {status.activeSessions}</div>
                </>
              ) : (
                <Loader2 className="h-3 w-3 animate-spin" />
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center gap-2 text-xs font-medium mb-2">
            <ScrollText className="h-3.5 w-3.5 text-amber-500" /> Recent Apply Events
          </div>
          {events.length === 0 ? (
            <p className="text-[10px] text-muted-foreground">No apply events yet.</p>
          ) : (
            <div className="space-y-1">
              {events.slice(0, 5).map((e: any) => (
                <div key={e.id} className="flex items-center justify-between text-[10px] py-1 px-2 rounded bg-muted/20">
                  <div className="flex items-center gap-2">
                    {e.status === "success" ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <XCircle className="h-3 w-3 text-red-500" />}
                    <span className="font-medium">{e.action}</span>
                    <span className="text-muted-foreground">v{e.version}</span>
                  </div>
                  {e.createdAt && <span className="text-muted-foreground">{new Date(e.createdAt).toLocaleString()}</span>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const renderRuntime = () => (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Runtime / General</h3>
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Log Level</Label>
            <Select value={runtimeDraft.logLevel || "INFO"} onValueChange={(v) => updateField("logLevel", v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["DEBUG", "INFO", "WARN", "ERROR"].map((l) => <SelectItem key={l} value={l} className="text-xs">{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Default Agent</Label>
            <Input className="h-8 text-xs" value={runtimeDraft.default_agent || ""} onChange={(e) => updateField("default_agent", e.target.value)} placeholder="build" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Model</Label>
            <Input className="h-8 text-xs" value={runtimeDraft.model || ""} onChange={(e) => updateField("model", e.target.value)} placeholder="anthropic/claude-sonnet-4-5" />
            <p className="text-[9px] text-muted-foreground mt-0.5">Format: provider/model-id</p>
          </div>
          <div>
            <Label className="text-xs">Small Model</Label>
            <Input className="h-8 text-xs" value={runtimeDraft.small_model || ""} onChange={(e) => updateField("small_model", e.target.value)} placeholder="anthropic/claude-haiku-4-5" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Share Mode</Label>
            <Select value={runtimeDraft.share || "manual"} onValueChange={(v) => updateField("share", v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["manual", "auto", "disabled"].map((m) => <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <div>
              <Label className="text-xs">Snapshot</Label>
              <div className="flex items-center gap-2 h-8">
                <Switch checked={runtimeDraft.snapshot ?? true} onCheckedChange={(v) => updateField("snapshot", v)} />
                <span className="text-[10px] text-muted-foreground">{runtimeDraft.snapshot ? "On" : "Off"}</span>
              </div>
            </div>
          </div>
          <div className="flex items-end gap-2">
            <div>
              <Label className="text-xs">Auto-update</Label>
              <div className="flex items-center gap-2 h-8">
                <Switch checked={runtimeDraft.autoupdate === true} onCheckedChange={(v) => updateField("autoupdate", v)} />
                <span className="text-[10px] text-muted-foreground">{runtimeDraft.autoupdate === true ? "On" : runtimeDraft.autoupdate === "notify" ? "Notify" : "Off"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderServer = () => (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Server Configuration</h3>
      <p className="text-[10px] text-muted-foreground">Settings for the OpenCode serve/web commands.</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Port</Label>
          <Input className="h-8 text-xs" type="number" value={runtimeDraft.server?.port ?? 4096} onChange={(e) => updateField("server.port", parseInt(e.target.value) || 4096)} />
        </div>
        <div>
          <Label className="text-xs">Hostname</Label>
          <Input className="h-8 text-xs" value={runtimeDraft.server?.hostname ?? "127.0.0.1"} onChange={(e) => updateField("server.hostname", e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-end gap-2">
          <div>
            <Label className="text-xs">mDNS</Label>
            <div className="flex items-center gap-2 h-8">
              <Switch checked={runtimeDraft.server?.mdns ?? false} onCheckedChange={(v) => updateField("server.mdns", v)} />
              <span className="text-[10px] text-muted-foreground">{runtimeDraft.server?.mdns ? "Enabled" : "Disabled"}</span>
            </div>
          </div>
        </div>
        <div>
          <Label className="text-xs">mDNS Domain</Label>
          <Input className="h-8 text-xs" value={runtimeDraft.server?.mdnsDomain ?? "opencode.local"} onChange={(e) => updateField("server.mdnsDomain", e.target.value)} />
        </div>
      </div>
      <div>
        <Label className="text-xs">CORS Origins</Label>
        <Input className="h-8 text-xs" value={(runtimeDraft.server?.cors ?? []).join(", ")} onChange={(e) => updateField("server.cors", e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean))} placeholder="https://example.com, https://app.example.com" />
        <p className="text-[9px] text-muted-foreground mt-0.5">Comma-separated URLs</p>
      </div>
    </div>
  );

  const renderProviders = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Providers & Models</h3>
        <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => openJsonEditor("provider", runtimeDraft.provider)}>
          <Code2 className="h-3 w-3 mr-1" /> Edit JSON
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Primary Model</Label>
          <Input className="h-8 text-xs" value={runtimeDraft.model || ""} onChange={(e) => updateField("model", e.target.value)} placeholder="anthropic/claude-sonnet-4-5" />
        </div>
        <div>
          <Label className="text-xs">Small Model</Label>
          <Input className="h-8 text-xs" value={runtimeDraft.small_model || ""} onChange={(e) => updateField("small_model", e.target.value)} placeholder="anthropic/claude-haiku-4-5" />
        </div>
      </div>
      <div>
        <Label className="text-xs">Enabled Providers</Label>
        <Input className="h-8 text-xs" value={(runtimeDraft.enabled_providers ?? []).join(", ")} onChange={(e) => updateField("enabled_providers", e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean))} placeholder="anthropic, openai, ollama" />
        <p className="text-[9px] text-muted-foreground mt-0.5">Comma-separated. Leave empty to enable all.</p>
      </div>
      <div>
        <Label className="text-xs">Disabled Providers</Label>
        <Input className="h-8 text-xs" value={(runtimeDraft.disabled_providers ?? []).join(", ")} onChange={(e) => updateField("disabled_providers", e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean))} placeholder="" />
      </div>
      <Separator />
      <div>
        <Label className="text-xs">Provider Configs (JSON)</Label>
        <p className="text-[9px] text-muted-foreground mb-1">Use {"{{secret:key_name}}"} for API keys. They will be redacted in previews.</p>
        {Object.keys(runtimeDraft.provider ?? {}).length === 0 ? (
          <p className="text-[10px] text-muted-foreground">No custom provider configs. Use Edit JSON to add.</p>
        ) : (
          <div className="space-y-1">
            {Object.entries(runtimeDraft.provider ?? {}).map(([key, val]: [string, any]) => (
              <div key={key} className="flex items-center justify-between py-1 px-2 rounded bg-muted/20 text-[10px]">
                <span className="font-medium">{key}</span>
                <div className="flex items-center gap-2">
                  {val?.name && <span className="text-muted-foreground">{val.name}</span>}
                  <Button variant="ghost" size="sm" className="h-5 px-1 text-[9px]" onClick={() => openJsonEditor(`provider.${key}`, val)}>Edit</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderAgents = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Agents</h3>
        <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => openJsonEditor("agent", runtimeDraft.agent)}>
          <Code2 className="h-3 w-3 mr-1" /> Edit JSON
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Configure custom agents. Built-in: build, plan, general, explore, compaction, title, summary.
      </p>
      <div>
        <Label className="text-xs">Default Agent</Label>
        <Input className="h-8 text-xs" value={runtimeDraft.default_agent || ""} onChange={(e) => updateField("default_agent", e.target.value)} placeholder="build" />
      </div>
      {Object.keys(runtimeDraft.agent ?? {}).length === 0 ? (
        <p className="text-[10px] text-muted-foreground">No custom agents defined. Use Edit JSON to add.</p>
      ) : (
        <div className="space-y-2">
          {Object.entries(runtimeDraft.agent ?? {}).map(([key, val]: [string, any]) => (
            <Card key={key}>
              <CardContent className="p-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-medium">{key}</span>
                    {val?.mode && <Badge variant="outline" className="text-[9px] ml-2">{val.mode}</Badge>}
                  </div>
                  <Button variant="ghost" size="sm" className="h-5 px-1 text-[9px]" onClick={() => openJsonEditor(`agent.${key}`, val)}>Edit</Button>
                </div>
                {val?.description && <p className="text-[10px] text-muted-foreground mt-0.5">{val.description}</p>}
                {val?.model && <p className="text-[10px] text-muted-foreground">Model: {val.model}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  const renderPermissions = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Permissions</h3>
        <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => openJsonEditor("permission", runtimeDraft.permission)}>
          <Code2 className="h-3 w-3 mr-1" /> Edit JSON
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Control tool permissions: "allow", "ask", or "deny". Supports per-tool and pattern-based rules.
      </p>
      {typeof runtimeDraft.permission === "string" ? (
        <div>
          <Label className="text-xs">Global Permission</Label>
          <Select value={runtimeDraft.permission} onValueChange={(v) => updateField("permission", v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["allow", "ask", "deny"].map((p) => <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      ) : typeof runtimeDraft.permission === "object" ? (
        <div className="space-y-1">
          {Object.entries(runtimeDraft.permission ?? {}).map(([key, val]) => (
            <div key={key} className="flex items-center justify-between py-1 px-2 rounded bg-muted/20 text-[10px]">
              <span className="font-mono">{key}</span>
              <Badge variant="outline" className="text-[9px]">{typeof val === "string" ? val : "object"}</Badge>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-muted-foreground">No permissions configured.</p>
      )}
    </div>
  );

  const renderCommands = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Commands</h3>
        <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => openJsonEditor("command", runtimeDraft.command)}>
          <Code2 className="h-3 w-3 mr-1" /> Edit JSON
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Custom command templates with $ARGUMENTS substitution.
      </p>
      {Object.keys(runtimeDraft.command ?? {}).length === 0 ? (
        <p className="text-[10px] text-muted-foreground">No custom commands. Use Edit JSON to add.</p>
      ) : (
        <div className="space-y-1">
          {Object.entries(runtimeDraft.command ?? {}).map(([key, val]: [string, any]) => (
            <div key={key} className="py-1 px-2 rounded bg-muted/20 text-[10px]">
              <div className="flex items-center justify-between">
                <span className="font-mono font-medium">/{key}</span>
                <Button variant="ghost" size="sm" className="h-5 px-1 text-[9px]" onClick={() => openJsonEditor(`command.${key}`, val)}>Edit</Button>
              </div>
              {val?.description && <p className="text-muted-foreground">{val.description}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderFormatters = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Formatters</h3>
        <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => openJsonEditor("formatter", runtimeDraft.formatter)}>
          <Code2 className="h-3 w-3 mr-1" /> Edit JSON
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Configure code formatters for different file types.
      </p>
      {Object.keys(runtimeDraft.formatter ?? {}).length === 0 ? (
        <p className="text-[10px] text-muted-foreground">No formatters configured. Use Edit JSON to add.</p>
      ) : (
        <div className="space-y-1">
          {Object.entries(runtimeDraft.formatter ?? {}).map(([key, val]: [string, any]) => (
            <div key={key} className="flex items-center justify-between py-1 px-2 rounded bg-muted/20 text-[10px]">
              <span className="font-mono">{key}</span>
              <Button variant="ghost" size="sm" className="h-5 px-1 text-[9px]" onClick={() => openJsonEditor(`formatter.${key}`, val)}>Edit</Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderMcpPlugins = () => (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">MCP Servers & Plugins</h3>
      <div className="space-y-3">
        <div>
          <div className="flex items-center justify-between mb-1">
            <Label className="text-xs">MCP Servers</Label>
            <Button variant="outline" size="sm" className="text-xs h-6" onClick={() => openJsonEditor("mcp", runtimeDraft.mcp)}>
              <Code2 className="h-3 w-3 mr-1" /> Edit JSON
            </Button>
          </div>
          {Object.keys(runtimeDraft.mcp ?? {}).length === 0 ? (
            <p className="text-[10px] text-muted-foreground">No MCP servers configured.</p>
          ) : (
            <div className="space-y-1">
              {Object.entries(runtimeDraft.mcp ?? {}).map(([key]) => (
                <div key={key} className="flex items-center justify-between py-1 px-2 rounded bg-muted/20 text-[10px]">
                  <span className="font-mono">{key}</span>
                  <Badge variant="outline" className="text-[9px]">MCP</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
        <Separator />
        <div>
          <Label className="text-xs">Plugins</Label>
          <Input className="h-8 text-xs" value={(runtimeDraft.plugin ?? []).join(", ")} onChange={(e) => updateField("plugin", e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean))} placeholder="plugin-name-1, plugin-name-2" />
          <p className="text-[9px] text-muted-foreground mt-0.5">Comma-separated npm package names.</p>
        </div>
      </div>
    </div>
  );

  const renderInstructions = () => (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Instructions & Watcher</h3>
      <div>
        <Label className="text-xs">Instructions (file paths/globs)</Label>
        <Input className="h-8 text-xs" value={(runtimeDraft.instructions ?? []).join(", ")} onChange={(e) => updateField("instructions", e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean))} placeholder=".opencode/instructions.md, AGENTS.md" />
      </div>
      <Separator />
      <div>
        <Label className="text-xs">Watcher Ignore Patterns</Label>
        <Input className="h-8 text-xs" value={(runtimeDraft.watcher?.ignore ?? []).join(", ")} onChange={(e) => updateField("watcher.ignore", e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean))} placeholder="node_modules, .git, dist" />
      </div>
      <Separator />
      <div>
        <Label className="text-xs">Compaction</Label>
        <div className="grid grid-cols-3 gap-3 mt-1">
          <div className="flex items-center gap-2">
            <Switch checked={runtimeDraft.compaction?.auto ?? true} onCheckedChange={(v) => updateField("compaction.auto", v)} />
            <span className="text-[10px]">Auto</span>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={runtimeDraft.compaction?.prune ?? true} onCheckedChange={(v) => updateField("compaction.prune", v)} />
            <span className="text-[10px]">Prune</span>
          </div>
          <div>
            <Input className="h-7 text-xs" type="number" value={runtimeDraft.compaction?.reserved ?? 10000} onChange={(e) => updateField("compaction.reserved", parseInt(e.target.value) || 10000)} />
            <p className="text-[9px] text-muted-foreground">Reserved tokens</p>
          </div>
        </div>
      </div>
      <Separator />
      <div>
        <div className="flex items-center justify-between mb-1">
          <Label className="text-xs">Skills</Label>
          <Button variant="outline" size="sm" className="text-xs h-6" onClick={() => openJsonEditor("skills", runtimeDraft.skills)}>
            <Code2 className="h-3 w-3 mr-1" /> Edit JSON
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-[10px] text-muted-foreground">Paths</Label>
            <Input className="h-7 text-xs" value={(runtimeDraft.skills?.paths ?? []).join(", ")} onChange={(e) => updateField("skills.paths", e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean))} />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">URLs</Label>
            <Input className="h-7 text-xs" value={(runtimeDraft.skills?.urls ?? []).join(", ")} onChange={(e) => updateField("skills.urls", e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean))} />
          </div>
        </div>
      </div>
    </div>
  );

  const renderTui = () => (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">TUI Configuration</h3>
      <p className="text-[10px] text-muted-foreground">Settings for the OpenCode terminal UI experience.</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Theme</Label>
          <Input className="h-8 text-xs" value={tuiDraft.theme || ""} onChange={(e) => { setTuiDraft((p) => ({ ...p, theme: e.target.value })); setDirty(true); }} placeholder="catppuccin-mocha" />
        </div>
        <div>
          <Label className="text-xs">Diff Style</Label>
          <Select value={tuiDraft.diff_style || "auto"} onValueChange={(v) => { setTuiDraft((p) => ({ ...p, diff_style: v })); setDirty(true); }}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto" className="text-xs">auto</SelectItem>
              <SelectItem value="stacked" className="text-xs">stacked</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Scroll Speed</Label>
          <Input className="h-8 text-xs" type="number" step="0.1" value={tuiDraft.scroll_speed ?? 1} onChange={(e) => { setTuiDraft((p) => ({ ...p, scroll_speed: parseFloat(e.target.value) || 1 })); setDirty(true); }} />
        </div>
        <div className="flex items-end gap-2">
          <div>
            <Label className="text-xs">Scroll Acceleration</Label>
            <div className="flex items-center gap-2 h-8">
              <Switch checked={tuiDraft.scroll_acceleration?.enabled ?? false} onCheckedChange={(v) => { setTuiDraft((p) => ({ ...p, scroll_acceleration: { ...p.scroll_acceleration, enabled: v } })); setDirty(true); }} />
              <span className="text-[10px] text-muted-foreground">{tuiDraft.scroll_acceleration?.enabled ? "On" : "Off"}</span>
            </div>
          </div>
        </div>
      </div>
      <Separator />
      <div>
        <div className="flex items-center justify-between mb-1">
          <Label className="text-xs">Keybinds</Label>
          <Button variant="outline" size="sm" className="text-xs h-6" onClick={() => { setJsonEditorSection("keybinds"); setJsonEditorValue(JSON.stringify(tuiDraft.keybinds ?? {}, null, 2)); setJsonEditorOpen(true); }}>
            <Keyboard className="h-3 w-3 mr-1" /> Edit Keybinds
          </Button>
        </div>
        <p className="text-[9px] text-muted-foreground">96 bindable actions. Use the JSON editor for complex keybind configuration.</p>
        {Object.keys(tuiDraft.keybinds ?? {}).length > 0 && (
          <div className="mt-1 space-y-0.5">
            {Object.entries(tuiDraft.keybinds).slice(0, 5).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between text-[10px] py-0.5 px-2 rounded bg-muted/20">
                <span className="font-mono">{k}</span>
                <span className="text-muted-foreground font-mono">{String(v)}</span>
              </div>
            ))}
            {Object.keys(tuiDraft.keybinds).length > 5 && (
              <p className="text-[9px] text-muted-foreground px-2">...and {Object.keys(tuiDraft.keybinds).length - 5} more</p>
            )}
          </div>
        )}
      </div>
      <Separator />
      <div>
        <Label className="text-xs">TUI Plugins</Label>
        <Input className="h-8 text-xs" value={(tuiDraft.plugin ?? []).join(", ")} onChange={(e) => { setTuiDraft((p) => ({ ...p, plugin: e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean) })); setDirty(true); }} placeholder="plugin-name" />
      </div>
    </div>
  );

  const renderAdvanced = () => (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Advanced / Experimental</h3>
      <div>
        <div className="flex items-center justify-between mb-1">
          <Label className="text-xs">Experimental Settings</Label>
          <Button variant="outline" size="sm" className="text-xs h-6" onClick={() => openJsonEditor("experimental", runtimeDraft.experimental)}>
            <Code2 className="h-3 w-3 mr-1" /> Edit JSON
          </Button>
        </div>
        <p className="text-[9px] text-muted-foreground">Options under active development. May change without notice.</p>
      </div>
      <Separator />
      <div>
        <h4 className="text-xs font-medium mb-2">Full Config JSON Editor</h4>
        <p className="text-[9px] text-muted-foreground mb-2">Edit the entire {activeTab} config as JSON.</p>
        <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => openJsonEditor("", activeTab === "runtime" ? runtimeDraft : tuiDraft)}>
          <Braces className="h-3 w-3 mr-1" /> Open Full JSON Editor
        </Button>
      </div>
    </div>
  );

  const renderStatus = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Runtime Status</h3>
        <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => runtimeStatusQuery.refetch()}>
          <RefreshCw className="h-3 w-3 mr-1" /> Refresh
        </Button>
      </div>
      {runtimeStatusQuery.isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin" /></div>
      ) : status ? (
        <>
          <Card>
            <CardContent className="p-3 space-y-2">
              <div className="text-xs font-medium flex items-center gap-2">
                <Activity className="h-3.5 w-3.5 text-violet-500" /> OpenCode Runtime
              </div>
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant={status.opencode.healthy ? "default" : "destructive"} className="text-[9px]">
                    {status.opencode.healthy ? "Online" : "Offline"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Version</span>
                  <span>{status.opencode.version ?? "N/A"}</span>
                </div>
                {status.opencode.error && (
                  <div className="col-span-2 flex items-center gap-1 text-red-500">
                    <AlertTriangle className="h-3 w-3" />
                    <span>{status.opencode.error}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3 space-y-2">
              <div className="text-xs font-medium">Runtime Config</div>
              <div className="grid grid-cols-2 gap-1 text-[10px]">
                <div className="flex justify-between"><span className="text-muted-foreground">Profile</span><span>{status.runtime.profileName ?? "None"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Version</span><span>{status.runtime.appliedVersion ?? "N/A"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Status</span><Badge variant="outline" className="text-[9px]">{status.runtime.status}</Badge></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Applied</span><span>{status.runtime.appliedAt ? new Date(status.runtime.appliedAt).toLocaleString() : "Never"}</span></div>
                {status.runtime.lastApply && (
                  <div className="col-span-2 flex justify-between">
                    <span className="text-muted-foreground">Last Apply</span>
                    <Badge variant={status.runtime.lastApply.status === "success" ? "default" : "destructive"} className="text-[9px]">{status.runtime.lastApply.status}</Badge>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3 space-y-2">
              <div className="text-xs font-medium">TUI Config</div>
              <div className="grid grid-cols-2 gap-1 text-[10px]">
                <div className="flex justify-between"><span className="text-muted-foreground">Profile</span><span>{status.tui.profileName ?? "None"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Version</span><span>{status.tui.appliedVersion ?? "N/A"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Status</span><Badge variant="outline" className="text-[9px]">{status.tui.status}</Badge></div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3 space-y-1">
              <div className="text-xs font-medium">Environment</div>
              <div className="grid grid-cols-2 gap-1 text-[10px]">
                <div className="flex justify-between"><span className="text-muted-foreground">Agents</span><span>{status.agents}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Sessions</span><span>{status.activeSessions}</span></div>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">Failed to load runtime status.</p>
      )}
    </div>
  );

  const renderTools = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Tools</h3>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Tool availability is now managed through Permissions. Use the Permissions section to configure tool access rules.
      </p>
      <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setActiveSection("permissions")}>
        <ChevronRight className="h-3 w-3 mr-1" /> Go to Permissions
      </Button>
    </div>
  );

  const renderContent = () => {
    switch (activeSection) {
      case "overview": return renderOverview();
      case "runtime": return renderRuntime();
      case "server": return renderServer();
      case "providers": return renderProviders();
      case "tools": return renderTools();
      case "agents": return renderAgents();
      case "permissions": return renderPermissions();
      case "commands": return renderCommands();
      case "formatters": return renderFormatters();
      case "mcp-plugins": return renderMcpPlugins();
      case "instructions": return renderInstructions();
      case "tui": return renderTui();
      case "advanced": return renderAdvanced();
      case "status": return renderStatus();
      default: return renderOverview();
    }
  };

  // ── Layout ─────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b shrink-0">
        <div className="flex items-center gap-2">
          <Code2 className="h-4 w-4 text-violet-500" />
          <span className="text-sm font-semibold">OpenCode Settings</span>
          {dirty && <Badge variant="secondary" className="text-[9px]">Unsaved</Badge>}
        </div>
        <div className="flex items-center gap-1">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "runtime" | "tui")}>
            <TabsList className="h-7">
              <TabsTrigger value="runtime" className="text-[10px] px-2 h-5">Runtime</TabsTrigger>
              <TabsTrigger value="tui" className="text-[10px] px-2 h-5">TUI</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Main body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left nav */}
        <div className="w-44 shrink-0 border-r overflow-y-auto">
          {SECTIONS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveSection(key)}
              className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs transition-colors ${
                activeSection === key
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <Icon className="h-3 w-3 shrink-0 opacity-70" />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>

        {/* Center content */}
        <ScrollArea className="flex-1 p-4">
          {renderContent()}
        </ScrollArea>
      </div>

      {/* Bottom action bar */}
      <div className="flex items-center justify-between px-4 py-2 border-t bg-muted/30 shrink-0">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" className="text-xs h-7" onClick={handleSave} disabled={updateDraftMut.isPending || !dirty}>
            {updateDraftMut.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
            Save Draft
          </Button>
          <Button variant="outline" size="sm" className="text-xs h-7" onClick={handleValidate} disabled={validateMut.isPending || validateTuiMut.isPending}>
            <CheckCircle2 className="h-3 w-3 mr-1" /> Validate
          </Button>
          <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setPreviewOpen(true)}>
            <Eye className="h-3 w-3 mr-1" /> Preview
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => runtimeStatusQuery.refetch()}>
            <Activity className="h-3 w-3 mr-1" /> Health
          </Button>
          <Button size="sm" className="text-xs h-7" onClick={handleApply} disabled={applyMut.isPending}>
            {applyMut.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Play className="h-3 w-3 mr-1" />}
            Apply to Runtime
          </Button>
        </div>
      </div>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-lg max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="text-sm">Generated Config Preview ({activeTab})</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <pre className="text-[10px] font-mono bg-muted/30 p-3 rounded overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(
                (() => {
                  const d = activeTab === "runtime" ? runtimeDraft : tuiDraft;
                  // Client-side redaction for preview
                  return redactPreview(d);
                })(),
                null,
                2,
              )}
            </pre>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* JSON Editor Dialog */}
      <Dialog open={jsonEditorOpen} onOpenChange={setJsonEditorOpen}>
        <DialogContent className="max-w-lg max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="text-sm">JSON Editor{jsonEditorSection ? ` — ${jsonEditorSection}` : ""}</DialogTitle>
          </DialogHeader>
          <textarea
            className="w-full h-64 font-mono text-[10px] bg-muted/30 p-3 rounded border resize-y"
            value={jsonEditorValue}
            onChange={(e) => setJsonEditorValue(e.target.value)}
            spellCheck={false}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setJsonEditorOpen(false)}>Cancel</Button>
            <Button size="sm" className="text-xs h-7" onClick={saveJsonEditor}>Apply</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Client-side secret redaction for preview
function redactPreview(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") {
    if (/^\{\{secret:[a-zA-Z0-9_-]+\}\}$/.test(obj)) return "***REDACTED***";
    return obj;
  }
  if (Array.isArray(obj)) return obj.map(redactPreview);
  if (typeof obj !== "object") return obj;
  const result: Record<string, any> = {};
  const sensitiveKeys = ["password", "secret", "token", "key", "apikey"];
  for (const [k, v] of Object.entries(obj)) {
    const lower = k.toLowerCase();
    if (sensitiveKeys.some((s) => lower.includes(s)) && typeof v === "string") {
      result[k] = "***REDACTED***";
    } else if (typeof v === "object" && v !== null) {
      result[k] = redactPreview(v);
    } else {
      result[k] = v;
    }
  }
  return result;
}
