/**
 * ChatControlBox — Self-contained, reusable chat input component.
 *
 * Drop-in ready: only 3 required props (value, onChange, onSend).
 * Everything else is optional and progressive — pass what you need.
 *
 * Built-in features (zero config):
 *   - Auto-growing textarea with Enter-to-send
 *   - Toolbar: Menu, New Chat, Providers, Presets, Settings gear, Save
 *   - Settings dropdown: Presets Setting, Categories Setting, Chat Theme, Language, Export Data
 *   - Presets & Categories CRUD dialogs (localStorage-backed)
 *   - Provider/Model selection panel (pass providers/models data)
 *   - File attachments, Paperclip/Plug/Mic icons
 *   - Responsive (mobile-aware)
 *
 * Usage:
 *   import { ChatControlBox } from "@/components/ChatControlBox";
 *
 *   // Minimal
 *   <ChatControlBox value={input} onChange={setInput} onSend={handleSend} />
 *
 *   // With providers (from tRPC or any source)
 *   <ChatControlBox
 *     value={input} onChange={setInput} onSend={handleSend}
 *     providers={[{ id: 1, name: "OpenAI", type: "openai" }]}
 *     providerModels={[{ id: "gpt-4", name: "GPT-4" }]}
 *     selectedProviderId={1}
 *     selectedModelId="gpt-4"
 *     onProviderSelect={setProvider}
 *     onModelSelect={setModel}
 *   />
 *
 *   // With chat management callbacks
 *   <ChatControlBox
 *     value={input} onChange={setInput} onSend={handleSend}
 *     onNewChat={handleNew} onSaveChat={handleSave} onExport={handleExport}
 *     onRenameChat={handleRename} onDeleteChat={handleDelete}
 *     recentChats={recents} onSwitchChat={handleSwitch}
 *   />
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Menu, Plus, Settings, Paperclip, Bot, Trash2, Download, Loader2,
  Sparkles, Square, Save, Plug, Mic, PenLine, Archive, BarChart3,
  MessageSquare, Sun, Moon, Monitor, Palette, ChevronDown, Globe,
  X, LayoutGrid,
} from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";

// =============================================================================
// TYPES
// =============================================================================

export interface ChatControlBoxProps {
  /** Current input text (required) */
  value: string;
  /** Input change handler (required) */
  onChange: (value: string) => void;
  /** Send handler (required) */
  onSend: () => void;

  // --- Input state ---
  isStreaming?: boolean;
  disabled?: boolean;
  placeholder?: string;
  onStop?: () => void;

  // --- Provider/Model (pass data from any source: tRPC, REST, static) ---
  providers?: Array<{ id: number; name: string; type?: string }>;
  providerModels?: Array<{ id: string; name: string }>;
  selectedProviderId?: number | null;
  selectedModelId?: string | null;
  onProviderSelect?: (id: number) => void;
  onModelSelect?: (id: string | null) => void;
  providersLoading?: boolean;
  modelsLoading?: boolean;
  providerCount?: number;
  modelCount?: number;
  modelsEnabled?: boolean;

  // --- Chat management (all optional) ---
  onNewChat?: () => void;
  onSaveChat?: () => void;
  isSaved?: boolean;
  messageCount?: number;
  onExport?: () => void;
  onRenameChat?: () => void;
  onArchiveChat?: () => void;
  onDeleteChat?: () => void;
  onAnalytics?: () => void;
  onSwitchChat?: (id: string) => void;
  recentChats?: Array<{ id: string; title: string; messageCount: number; updatedAt: string }>;
}

// =============================================================================
// INTERNAL: PRESETS & CATEGORIES (localStorage-backed, self-contained)
// =============================================================================

interface Preset { id: string; name: string; prompt: string; }
interface Category { id: string; name: string; color: string; }

const PRESETS_KEY = "mynewapp_presets";
const CATEGORIES_KEY = "mynewapp_categories";

const DEFAULT_PRESETS: Preset[] = [
  { id: "1", name: "Code Review", prompt: "Review this code and suggest improvements:" },
  { id: "2", name: "Explain", prompt: "Explain this concept in simple terms:" },
  { id: "3", name: "Summarize", prompt: "Summarize the following:" },
  { id: "4", name: "Debug", prompt: "Help me debug this issue:" },
];

const DEFAULT_CATEGORIES: Category[] = [
  { id: "1", name: "General", color: "bg-blue-500" },
  { id: "2", name: "Coding", color: "bg-green-500" },
  { id: "3", name: "Writing", color: "bg-purple-500" },
  { id: "4", name: "Research", color: "bg-orange-500" },
];

const CATEGORY_COLORS = [
  "bg-blue-500", "bg-green-500", "bg-purple-500", "bg-orange-500",
  "bg-red-500", "bg-yellow-500", "bg-pink-500", "bg-teal-500",
];

function loadJSON<T>(key: string, fallback: T): T {
  try { const r = localStorage.getItem(key); if (r) return JSON.parse(r); } catch {}
  return fallback;
}
function storeJSON(key: string, val: unknown) { localStorage.setItem(key, JSON.stringify(val)); }

// =============================================================================
// INTERNAL: HELPERS
// =============================================================================

function timeAgo(d: string): string {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const PCOLORS: Record<string, string> = {
  openai: "bg-green-500", anthropic: "bg-orange-500", google: "bg-blue-500",
  ollama: "bg-purple-500", "llama.cpp": "bg-yellow-500", default: "bg-gray-500",
};
function pcolor(t?: string) { return (t && PCOLORS[t.toLowerCase()]) || PCOLORS.default; }

function SendIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      vectorEffect="non-scaling-stroke" aria-hidden="true" className={className} style={style}>
      <path d="M12 2 L18 10 L13.5 9.5 L13.5 18 Q13.5 21 12 21 Q10.5 21 10.5 18 L10.5 9.5 L6 10 Z" />
    </svg>
  );
}

function useIsMobile(bp = 768) {
  const [m, setM] = useState(() => typeof window !== "undefined" && window.innerWidth < bp);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${bp - 1}px)`);
    const h = (e: MediaQueryListEvent) => setM(e.matches);
    setM(mq.matches); mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, [bp]);
  return m;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function ChatControlBox({
  value, onChange, onSend,
  isStreaming = false, disabled = false, placeholder = "Type your message...", onStop,
  providers, providerModels, selectedProviderId, selectedModelId,
  onProviderSelect, onModelSelect, providersLoading = false, modelsLoading = false,
  providerCount, modelCount, modelsEnabled = true,
  onNewChat, onSaveChat, isSaved = false, messageCount = 0, onExport,
  onRenameChat, onArchiveChat, onDeleteChat, onAnalytics, onSwitchChat, recentChats,
}: ChatControlBoxProps) {
  const isMobile = useIsMobile();
  const { theme, setTheme } = useTheme();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<File[]>([]);

  // Dropdown states
  const [showMenu, setShowMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showThemeSub, setShowThemeSub] = useState(false);
  const [showModelsPanel, setShowModelsPanel] = useState(false);
  const [showProvDD, setShowProvDD] = useState(false);
  const [showModelDD, setShowModelDD] = useState(false);

  // Modals
  const [showPresetsDlg, setShowPresetsDlg] = useState(false);
  const [showCatDlg, setShowCatDlg] = useState(false);

  // Presets state
  const [presets, setPresets] = useState<Preset[]>(() => loadJSON(PRESETS_KEY, DEFAULT_PRESETS));
  const [editPId, setEditPId] = useState<string | null>(null);
  const [newPName, setNewPName] = useState("");
  const [newPPrompt, setNewPPrompt] = useState("");

  // Categories state
  const [categories, setCategories] = useState<Category[]>(() => loadJSON(CATEGORIES_KEY, DEFAULT_CATEGORIES));
  const [newCName, setNewCName] = useState("");
  const [newCColor, setNewCColor] = useState(CATEGORY_COLORS[0]);

  // --- Derived ---
  const pCount = providerCount ?? providers?.length ?? 0;
  const mCount = modelCount ?? providerModels?.length ?? 0;
  const selProv = providers?.find((p) => p.id === selectedProviderId);
  const selModel = providerModels?.find((m) => m.id === selectedModelId);
  const inputOff = disabled || !modelsEnabled;
  const canSend = !inputOff && value.trim().length > 0;

  // --- Textarea auto-grow ---
  const adjust = useCallback(() => {
    const el = textareaRef.current; if (!el) return;
    el.style.height = "auto";
    const h = el.scrollHeight;
    el.style.height = `${Math.min(h, 200)}px`;
    el.style.overflowY = h > 200 ? "auto" : "hidden";
  }, []);
  useEffect(() => { adjust(); }, [value, adjust]);

  // --- Helpers ---
  const closeDDs = () => { setShowMenu(false); setShowSettings(false); setShowThemeSub(false); };
  const closeMP = () => { setShowModelsPanel(false); setShowProvDD(false); setShowModelDD(false); };

  const handleExport = () => { onExport ? onExport() : toast.info("No export handler configured"); };

  // Presets CRUD
  const addPreset = () => {
    if (!newPName.trim()) return;
    const u = [...presets, { id: Date.now().toString(36), name: newPName.trim(), prompt: newPPrompt.trim() }];
    setPresets(u); storeJSON(PRESETS_KEY, u); setNewPName(""); setNewPPrompt(""); toast.success("Preset added");
  };
  const delPreset = (id: string) => { const u = presets.filter((p) => p.id !== id); setPresets(u); storeJSON(PRESETS_KEY, u); };
  const updPreset = (id: string) => { storeJSON(PRESETS_KEY, presets); setEditPId(null); toast.success("Preset updated"); };
  const usePreset = (p: Preset) => { onChange(p.prompt + " "); setShowPresetsDlg(false); toast.success(`Applied: ${p.name}`); };

  // Categories CRUD
  const addCat = () => {
    if (!newCName.trim()) return;
    const u = [...categories, { id: Date.now().toString(36), name: newCName.trim(), color: newCColor }];
    setCategories(u); storeJSON(CATEGORIES_KEY, u); setNewCName(""); toast.success("Category added");
  };
  const delCat = (id: string) => { const u = categories.filter((c) => c.id !== id); setCategories(u); storeJSON(CATEGORIES_KEY, u); };

  // --- Key handler ---
  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !isMobile) {
      e.preventDefault();
      if (canSend && !isStreaming) onSend();
    }
  };

  // --- File upload ---
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files; if (!f) return;
    setAttachments((prev) => [...prev, ...Array.from(f)]);
    toast.success(`${f.length} file(s) attached`); e.target.value = "";
  };

  // =========================================================================
  // RENDER
  // =========================================================================
  return (
    <div className="rounded-2xl border bg-card shadow-sm">

      {/* ── MODELS PANEL (above toolbar) ── */}
      {showModelsPanel && (
        <div className="border-b bg-muted/30 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">Select Provider & Model</h3>
            <button onClick={closeMP} className="h-6 w-6 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          {selProv && selModel && (
            <div className="flex flex-wrap gap-2 mb-3">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/20 rounded-full text-xs font-medium text-foreground">
                <div className={`w-2 h-2 rounded-full ${pcolor(selProv.type)}`} />
                <span>{selProv.name}: {selModel.name}</span>
                <button onClick={() => onModelSelect?.(null)} className="ml-1 text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            {/* Provider dropdown */}
            <div className="relative flex-1 min-w-[180px]">
              <button onClick={() => { setShowProvDD(!showProvDD); setShowModelDD(false); }}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-background border border-border rounded-lg text-sm hover:bg-muted transition-colors">
                <div className="flex items-center gap-2">
                  {selProv ? (<><div className={`w-2 h-2 rounded-full ${pcolor(selProv.type)}`} /><span>{selProv.name}</span></>) :
                    (<><Globe className="h-4 w-4 text-muted-foreground" /><span className="text-muted-foreground">Select Provider</span></>)}
                </div>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showProvDD ? "rotate-180" : ""}`} />
              </button>
              {showProvDD && (<>
                <div className="fixed inset-0 z-[199]" onClick={() => setShowProvDD(false)} />
                <div className="absolute top-full left-0 right-0 mt-1 z-[200] bg-popover border border-border rounded-lg shadow-lg max-h-[300px] overflow-y-auto">
                  {providersLoading ? <div className="flex justify-center p-4"><Loader2 className="h-4 w-4 animate-spin" /></div> :
                    providers && providers.length > 0 ? providers.map((p) => (
                      <button key={p.id} onClick={() => { onProviderSelect?.(p.id); onModelSelect?.(null); setShowProvDD(false); setShowModelDD(false); }}
                        className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted text-left transition-colors ${p.id === selectedProviderId ? "bg-primary/10 text-primary" : "text-popover-foreground"}`}>
                        <div className={`w-2 h-2 rounded-full ${pcolor(p.type)}`} /><span>{p.name}</span>
                      </button>
                    )) : <div className="p-4 text-sm text-muted-foreground text-center">No providers configured</div>}
                </div>
              </>)}
            </div>

            {/* Model dropdown */}
            {selectedProviderId && (
              <div className="relative flex-1 min-w-[200px]">
                <button onClick={() => { setShowModelDD(!showModelDD); setShowProvDD(false); }}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-background border border-border rounded-lg text-sm hover:bg-muted transition-colors">
                  <span className={selModel ? "text-foreground" : "text-muted-foreground"}>{selModel ? selModel.name : "Select Model"}</span>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showModelDD ? "rotate-180" : ""}`} />
                </button>
                {showModelDD && (<>
                  <div className="fixed inset-0 z-[199]" onClick={() => setShowModelDD(false)} />
                  <div className="absolute top-full left-0 right-0 mt-1 z-[200] bg-popover border border-border rounded-lg shadow-lg max-h-[300px] overflow-y-auto">
                    {modelsLoading ? <div className="flex justify-center p-4"><Loader2 className="h-4 w-4 animate-spin" /></div> :
                      providerModels && providerModels.length > 0 ? providerModels.map((m) => (
                        <button key={m.id} onClick={() => { onModelSelect?.(m.id); setShowModelDD(false); }}
                          className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted text-left transition-colors ${m.id === selectedModelId ? "bg-primary/10 text-primary" : "text-popover-foreground"}`}>
                          <span>{m.name}</span>
                        </button>
                      )) : <div className="p-4 text-sm text-muted-foreground text-center">No models available</div>}
                  </div>
                </>)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ATTACHMENTS ── */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 pt-3">
          {attachments.map((f, i) => (
            <div key={i} className="flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
              <Paperclip className="h-3 w-3" /><span className="max-w-[100px] truncate">{f.name}</span>
              <button onClick={() => setAttachments((a) => a.filter((_, j) => j !== i))} className="ml-1 text-muted-foreground hover:text-foreground">&times;</button>
            </div>
          ))}
        </div>
      )}

      <div className="p-3">
        {/* ── TOOLBAR ── */}
        <div className={`flex items-center ${isMobile ? "flex-wrap justify-between gap-1 mb-2" : "gap-1 mb-2"}`}>

          {/* Menu */}
          <div className="relative">
            <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-foreground"
              onClick={() => { setShowMenu(!showMenu); setShowSettings(false); setShowThemeSub(false); }} title="Menu">
              <Menu className="h-4 w-4" />
            </Button>
            {showMenu && (<>
              <div className="fixed inset-0 z-[9998]" onClick={closeDDs} />
              <div className="absolute bottom-full left-0 mb-2 w-[280px] bg-popover border border-border rounded-xl shadow-2xl z-[9999] overflow-hidden">
                <button onClick={() => { onNewChat?.(); closeDDs(); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left text-popover-foreground hover:bg-muted"><Plus className="h-4 w-4" /><span>New Chat</span></button>
                {onRenameChat && <button onClick={() => { onRenameChat(); closeDDs(); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left text-popover-foreground hover:bg-muted"><PenLine className="h-4 w-4" /><span>Rename Chat</span></button>}
                {onSaveChat && <button onClick={() => { onSaveChat(); closeDDs(); }} disabled={isSaved || messageCount === 0} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left text-popover-foreground hover:bg-muted disabled:opacity-50"><Save className="h-4 w-4" /><span>{isSaved ? "Saved \u2713" : "Save Chat"}</span></button>}
                <button onClick={() => { onNewChat?.(); closeDDs(); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left text-popover-foreground hover:bg-muted"><Trash2 className="h-4 w-4" /><span>Clear Chat</span></button>
                {onAnalytics && <button onClick={() => { onAnalytics(); closeDDs(); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left text-popover-foreground hover:bg-muted"><BarChart3 className="h-4 w-4" /><span>Analytics</span></button>}
                <div className="border-t border-border my-1" />
                {onArchiveChat && <button onClick={() => { onArchiveChat(); closeDDs(); }} disabled={messageCount === 0} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left text-popover-foreground hover:bg-muted disabled:opacity-50"><Archive className="h-4 w-4" /><span>Archive Chat</span></button>}
                {onDeleteChat && <button onClick={() => { onDeleteChat(); closeDDs(); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left text-destructive hover:bg-muted"><Trash2 className="h-4 w-4" /><span>Delete Chat</span></button>}
                <button onClick={() => { handleExport(); closeDDs(); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left text-popover-foreground hover:bg-muted"><Download className="h-4 w-4" /><span>Export Chat</span></button>
                {recentChats && recentChats.length > 0 && (<>
                  <div className="border-t border-border mt-1" />
                  <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase">Recent Conversations</div>
                  {recentChats.map((c) => (
                    <button key={c.id} onClick={() => { onSwitchChat?.(c.id); closeDDs(); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left text-popover-foreground hover:bg-muted">
                      <MessageSquare className="h-4 w-4 shrink-0" /><span className="truncate flex-1">{c.title}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(c.updatedAt)}</span>
                    </button>
                  ))}
                </>)}
              </div>
            </>)}
          </div>

          {/* New Chat */}
          <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-foreground" onClick={onNewChat} title="New Chat"><Plus className="h-4 w-4" /></Button>

          {/* Providers pill */}
          <button onClick={() => { setShowModelsPanel(!showModelsPanel); closeDDs(); }}
            className={`h-7 px-2.5 text-xs font-semibold rounded-full transition-colors flex items-center gap-1 ${showModelsPanel ? "bg-primary text-primary-foreground ring-2 ring-primary/30" : "bg-primary text-primary-foreground hover:bg-primary/80"}`}
            title={selProv?.name || "Select Provider"}>
            <Sparkles className="h-3 w-3" />{pCount} Provider{pCount !== 1 ? "s" : ""}
          </button>

          {/* Presets pill */}
          <button onClick={() => setShowPresetsDlg(true)}
            className="h-7 px-2.5 bg-muted text-muted-foreground text-xs font-semibold rounded-full transition-colors hover:bg-muted/80 hover:text-foreground flex items-center gap-1" title="Presets">
            <Sparkles className="h-3 w-3" />Presets
          </button>

          {/* Bot icon */}
          {modelsEnabled && <Button variant="ghost" size="icon-sm" className="text-muted-foreground" title="AI Active" disabled><Bot className="h-4 w-4" /></Button>}

          {/* Settings gear */}
          <div className="relative">
            <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-foreground"
              onClick={() => { setShowSettings(!showSettings); setShowMenu(false); setShowThemeSub(false); }} title="Settings">
              <Settings className="h-4 w-4" />
            </Button>
            {showSettings && (<>
              <div className="fixed inset-0 z-[9998]" onClick={closeDDs} />
              <div className="absolute bottom-full right-0 mb-2 w-[220px] bg-popover border border-border rounded-xl shadow-2xl z-[9999] overflow-visible">
                <div className="px-4 py-3 border-b border-border"><h3 className="text-sm font-semibold text-popover-foreground m-0">Settings</h3></div>
                <button onClick={() => { setShowPresetsDlg(true); closeDDs(); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left text-popover-foreground hover:bg-muted"><Sparkles className="h-4 w-4" /><span>Presets Setting</span></button>
                <button onClick={() => { setShowCatDlg(true); closeDDs(); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left text-popover-foreground hover:bg-muted"><LayoutGrid className="h-4 w-4" /><span>Categories Setting</span></button>
                <div className="relative">
                  <button onClick={() => setShowThemeSub(!showThemeSub)} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left text-popover-foreground hover:bg-muted">
                    <Palette className="h-4 w-4" /><span className="flex-1">Chat Theme</span>
                    <span className="text-xs text-muted-foreground">{theme === "light" ? "Light" : theme === "dark" ? "Dark" : "System"}</span>
                  </button>
                  {showThemeSub && (
                    <div className="absolute left-full top-0 ml-1 w-32 bg-popover border border-border rounded-lg shadow-lg z-[10000]">
                      {([["light", Sun, "Light"], ["dark", Moon, "Dark"], ["system", Monitor, "System"]] as const).map(([t, Icon, label]) => (
                        <button key={t} onClick={() => { setTheme(t); closeDDs(); }}
                          className={`w-full px-4 py-2 text-left text-sm hover:bg-muted ${theme === t ? "bg-primary/10 text-primary" : "text-popover-foreground"}`}>
                          <Icon className="h-3.5 w-3.5 inline mr-2" />{label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={() => { toast.info("Language settings coming soon"); closeDDs(); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left text-popover-foreground hover:bg-muted"><Globe className="h-4 w-4" /><span>Language</span></button>
                <div className="border-t border-border my-1" />
                <button onClick={() => { handleExport(); closeDDs(); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left text-popover-foreground hover:bg-muted"><Download className="h-4 w-4" /><span>Export Data</span></button>
              </div>
            </>)}
          </div>

          {/* Save */}
          {onSaveChat && (
            <Button variant="ghost" size="icon-sm" className={isSaved ? "text-green-500" : "text-muted-foreground hover:text-foreground"}
              onClick={onSaveChat} disabled={isSaved || messageCount === 0} title={isSaved ? "Saved" : "Save chat"}>
              <Save className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* ── INPUT AREA ── */}
        <div className="flex flex-col">
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFile} />
          <div className="relative">
            <textarea ref={textareaRef} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={handleKey}
              placeholder={!modelsEnabled ? "Select models first..." : disabled ? "Select a provider first..." : placeholder}
              disabled={inputOff || isStreaming} rows={1}
              className="w-full resize-none rounded-2xl border bg-muted/50 pl-4 pr-12 pt-2.5 pb-10 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50"
              style={{ lineHeight: "1.5", minHeight: "56px", maxHeight: "200px" }} />
            <div className="absolute left-2 right-2 bottom-2 flex items-center justify-between">
              <div className="flex items-center gap-0.5">
                <button onClick={() => fileInputRef.current?.click()} className="h-7 w-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors" title="Attach files"><Paperclip className="h-4 w-4" /></button>
                <button onClick={() => toast.info("Connectors coming soon")} className="h-7 w-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors" title="Connect"><Plug className="h-3.5 w-3.5" /></button>
                <button onClick={() => toast.info("Voice input coming soon")} className="h-7 w-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors" title="Voice"><Mic className="h-3.5 w-3.5" /></button>
              </div>
              {isStreaming ? (
                <button onClick={onStop} className="h-7 w-7 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground transition-colors" title="Stop"><Square className="h-3 w-3" /></button>
              ) : (
                <button onClick={onSend} disabled={!canSend} className="h-7 w-7 flex items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed" title="Send (Enter)">
                  {inputOff ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendIcon className="h-4 w-4" />}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── PRESETS DIALOG ── */}
      <Dialog open={showPresetsDlg} onOpenChange={setShowPresetsDlg}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Presets Setting</DialogTitle></DialogHeader>
          <div className="space-y-2 mt-2">
            {presets.map((p) => (
              <div key={p.id} className="flex items-start gap-2 p-3 rounded-lg border bg-muted/30">
                {editPId === p.id ? (
                  <div className="flex-1 space-y-2">
                    <input className="w-full px-2 py-1 text-sm bg-background border border-border rounded" value={p.name}
                      onChange={(e) => setPresets(presets.map((x) => x.id === p.id ? { ...x, name: e.target.value } : x))} />
                    <textarea className="w-full px-2 py-1 text-sm bg-background border border-border rounded resize-none" rows={2} value={p.prompt}
                      onChange={(e) => setPresets(presets.map((x) => x.id === p.id ? { ...x, prompt: e.target.value } : x))} />
                    <div className="flex gap-2">
                      <button onClick={() => updPreset(p.id)} className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/80">Save</button>
                      <button onClick={() => setEditPId(null)} className="px-3 py-1 text-xs bg-muted text-muted-foreground rounded hover:bg-muted/80">Cancel</button>
                    </div>
                  </div>
                ) : (<>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{p.prompt}</div>
                  </div>
                  <button onClick={() => usePreset(p)} className="px-2 py-1 text-xs bg-primary/10 text-primary rounded hover:bg-primary/20 shrink-0">Use</button>
                  <button onClick={() => setEditPId(p.id)} className="p-1 text-muted-foreground hover:text-foreground shrink-0"><PenLine className="h-3.5 w-3.5" /></button>
                  <button onClick={() => delPreset(p.id)} className="p-1 text-muted-foreground hover:text-destructive shrink-0"><Trash2 className="h-3.5 w-3.5" /></button>
                </>)}
              </div>
            ))}
          </div>
          <div className="border-t pt-3 mt-3 space-y-2">
            <div className="text-sm font-medium">Add New Preset</div>
            <input className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg" placeholder="Preset name" value={newPName} onChange={(e) => setNewPName(e.target.value)} />
            <textarea className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg resize-none" placeholder="Prompt template..." rows={2} value={newPPrompt} onChange={(e) => setNewPPrompt(e.target.value)} />
            <button onClick={addPreset} disabled={!newPName.trim()} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/80 disabled:opacity-50">Add Preset</button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── CATEGORIES DIALOG ── */}
      <Dialog open={showCatDlg} onOpenChange={setShowCatDlg}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Categories Setting</DialogTitle></DialogHeader>
          <div className="space-y-2 mt-2">
            {categories.map((c) => (
              <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                <div className={`w-4 h-4 rounded-full ${c.color} shrink-0`} />
                <span className="text-sm font-medium flex-1">{c.name}</span>
                <button onClick={() => delCat(c.id)} className="p-1 text-muted-foreground hover:text-destructive shrink-0"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
          <div className="border-t pt-3 mt-3 space-y-2">
            <div className="text-sm font-medium">Add New Category</div>
            <input className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg" placeholder="Category name" value={newCName} onChange={(e) => setNewCName(e.target.value)} />
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Color:</span>
              {CATEGORY_COLORS.map((c) => (
                <button key={c} onClick={() => setNewCColor(c)} className={`w-6 h-6 rounded-full ${c} transition-transform ${newCColor === c ? "ring-2 ring-primary ring-offset-2 ring-offset-background scale-110" : ""}`} />
              ))}
            </div>
            <button onClick={addCat} disabled={!newCName.trim()} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/80 disabled:opacity-50">Add Category</button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ChatControlBox;
