import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Menu,
  Plus,
  Settings,
  Paperclip,
  Bot,
  Trash2,
  Download,
  Loader2,
  Sparkles,
  Square,
  Save,
  Plug,
  Mic,
  PenLine,
  Archive,
  BarChart3,
  MessageSquare,
  Upload,
  Sun,
  Moon,
  Monitor,
  Palette,
  ChevronDown,
  Globe,
  X,
  LayoutGrid,
} from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";

// =============================================================================
// PRESETS & CATEGORIES — localStorage backed (matches Manus)
// =============================================================================

interface Preset {
  id: string;
  name: string;
  prompt: string;
}

interface Category {
  id: string;
  name: string;
  color: string;
}

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

function loadPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return DEFAULT_PRESETS;
}

function savePresets(presets: Preset[]) {
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
}

function loadCategories(): Category[] {
  try {
    const raw = localStorage.getItem(CATEGORIES_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return DEFAULT_CATEGORIES;
}

function saveCategories(categories: Category[]) {
  localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
}

// =============================================================================
// CUSTOM SEND ICON (ported from Claude repo)
// =============================================================================

function SendIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      vectorEffect="non-scaling-stroke"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <path
        d="
          M12 2
          L18 10
          L13.5 9.5
          L13.5 18
          Q13.5 21 12 21
          Q10.5 21 10.5 18
          L10.5 9.5
          L6 10
          Z
        "
      />
    </svg>
  );
}

// =============================================================================
// RESPONSIVE HOOK
// =============================================================================

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth < breakpoint
  );

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [breakpoint]);

  return isMobile;
}

// =============================================================================
// TYPES
// =============================================================================

export interface ChatControlBoxProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  isStreaming?: boolean;
  disabled?: boolean;
  providerCount?: number;
  providerName?: string;
  modelCount?: number;
  modelName?: string;
  modelsEnabled?: boolean;
  onModelsToggle?: () => void;
  onModelsClick?: () => void;
  onNewChat?: () => void;
  onStop?: () => void;
  placeholder?: string;
  noProviderMessage?: string;
  onSaveChat?: () => void;
  isSaved?: boolean;
  messageCount?: number;
  onExport?: () => void;
  onPresetsClick?: () => void;
  onCategoriesClick?: () => void;
  onRenameChat?: () => void;
  onArchiveChat?: () => void;
  onDeleteChat?: () => void;
  onAnalytics?: () => void;
  onSwitchChat?: (id: string) => void;
  recentChats?: Array<{ id: string; title: string; messageCount: number; updatedAt: string }>;
  onExportAll?: () => void;
  onImportData?: (file: File) => void;
  onClearAllData?: () => void;
  autoSave?: boolean;
  onAutoSaveChange?: (v: boolean) => void;
  // Provider/Model selection (from tRPC)
  providers?: Array<{ id: number; name: string; type?: string }>;
  providerModels?: Array<{ id: string; name: string }>;
  selectedProviderId?: number | null;
  selectedModelId?: string | null;
  onProviderSelect?: (id: number) => void;
  onModelSelect?: (id: string | null) => void;
  providersLoading?: boolean;
  modelsLoading?: boolean;
}

// =============================================================================
// HELPERS
// =============================================================================

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Provider type → color mapping (matches Manus style)
const PROVIDER_COLORS: Record<string, string> = {
  openai: "bg-green-500",
  anthropic: "bg-orange-500",
  google: "bg-blue-500",
  ollama: "bg-purple-500",
  "llama.cpp": "bg-yellow-500",
  default: "bg-gray-500",
};

function getProviderColor(type?: string): string {
  if (!type) return PROVIDER_COLORS.default;
  return PROVIDER_COLORS[type.toLowerCase()] ?? PROVIDER_COLORS.default;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function ChatControlBox({
  value,
  onChange,
  onSend,
  isStreaming = false,
  disabled = false,
  providerCount = 0,
  providerName,
  modelCount = 0,
  modelName,
  modelsEnabled = true,
  onModelsToggle,
  onModelsClick,
  onNewChat,
  onStop,
  placeholder = "Type your message...",
  noProviderMessage,
  onSaveChat,
  isSaved = false,
  messageCount = 0,
  onExport,
  onPresetsClick,
  onCategoriesClick,
  onRenameChat,
  onArchiveChat,
  onDeleteChat,
  onAnalytics,
  onSwitchChat,
  recentChats,
  onExportAll,
  onImportData,
  onClearAllData,
  autoSave = false,
  onAutoSaveChange,
  // Provider/Model selection
  providers,
  providerModels,
  selectedProviderId,
  selectedModelId,
  onProviderSelect,
  onModelSelect,
  providersLoading = false,
  modelsLoading: modelsLoadingProp = false,
}: ChatControlBoxProps) {
  const isMobile = useIsMobile();
  const { theme, setTheme } = useTheme();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<File[]>([]);

  // Manual dropdown state
  const [showMenuDropdown, setShowMenuDropdown] = useState(false);
  const [showSettingsDropdown, setShowSettingsDropdown] = useState(false);
  const [showThemeSubmenu, setShowThemeSubmenu] = useState(false);

  // Models panel state (Manus-style)
  const [showModelsPanel, setShowModelsPanel] = useState(false);
  const [showProviderDropdown, setShowProviderDropdown] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);

  // Presets & Categories modals
  const [showPresetsModal, setShowPresetsModal] = useState(false);
  const [showCategoriesModal, setShowCategoriesModal] = useState(false);
  const [presets, setPresets] = useState<Preset[]>(loadPresets);
  const [categories, setCategories] = useState<Category[]>(loadCategories);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [newPresetName, setNewPresetName] = useState("");
  const [newPresetPrompt, setNewPresetPrompt] = useState("");
  const [newCatName, setNewCatName] = useState("");
  const [newCatColor, setNewCatColor] = useState(CATEGORY_COLORS[0]);

  // =========================================================================
  // TEXTAREA AUTO-GROW
  // =========================================================================

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const h = el.scrollHeight;
    el.style.height = `${Math.min(h, 200)}px`;
    el.style.overflowY = h > 200 ? "auto" : "hidden";
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  // =========================================================================
  // HANDLERS
  // =========================================================================

  const handleMenuClick = () => {
    setShowMenuDropdown(!showMenuDropdown);
    setShowSettingsDropdown(false);
    setShowThemeSubmenu(false);
  };

  const handleSettingsClick = () => {
    setShowSettingsDropdown(!showSettingsDropdown);
    setShowMenuDropdown(false);
    setShowThemeSubmenu(false);
  };

  const closeDropdowns = () => {
    setShowMenuDropdown(false);
    setShowSettingsDropdown(false);
    setShowThemeSubmenu(false);
  };

  const handleProvidersClick = () => {
    setShowModelsPanel(!showModelsPanel);
    closeDropdowns();
  };

  const handleModelsPanelToggle = () => {
    setShowModelsPanel(!showModelsPanel);
    closeDropdowns();
  };

  const closeModelsPanel = () => {
    setShowModelsPanel(false);
    setShowProviderDropdown(false);
    setShowModelDropdown(false);
  };

  const handleProviderSelect = (id: number) => {
    onProviderSelect?.(id);
    onModelSelect?.(null); // reset model when provider changes
    setShowProviderDropdown(false);
    setShowModelDropdown(false);
  };

  const handleModelSelectInPanel = (id: string) => {
    onModelSelect?.(id);
    setShowModelDropdown(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter") {
      if (e.shiftKey) return;
      if (!isMobile) {
        e.preventDefault();
        if (!inputDisabled && value.trim() && !isStreaming) {
          onSend();
        }
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const added = Array.from(files);
    setAttachments((prev) => [...prev, ...added]);
    toast.success(`${added.length} file(s) attached`);
    e.target.value = "";
  };

  const removeAttachment = (idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  // Presets CRUD
  const handleAddPreset = () => {
    if (!newPresetName.trim()) return;
    const p: Preset = { id: Date.now().toString(36), name: newPresetName.trim(), prompt: newPresetPrompt.trim() };
    const updated = [...presets, p];
    setPresets(updated);
    savePresets(updated);
    setNewPresetName("");
    setNewPresetPrompt("");
    toast.success("Preset added");
  };

  const handleDeletePreset = (id: string) => {
    const updated = presets.filter((p) => p.id !== id);
    setPresets(updated);
    savePresets(updated);
    toast.success("Preset deleted");
  };

  const handleUpdatePreset = (id: string, name: string, prompt: string) => {
    const updated = presets.map((p) => (p.id === id ? { ...p, name, prompt } : p));
    setPresets(updated);
    savePresets(updated);
    setEditingPresetId(null);
    toast.success("Preset updated");
  };

  const handleUsePreset = (preset: Preset) => {
    onChange(preset.prompt + " ");
    setShowPresetsModal(false);
    toast.success(`Applied preset: ${preset.name}`);
  };

  // Categories CRUD
  const handleAddCategory = () => {
    if (!newCatName.trim()) return;
    const c: Category = { id: Date.now().toString(36), name: newCatName.trim(), color: newCatColor };
    const updated = [...categories, c];
    setCategories(updated);
    saveCategories(updated);
    setNewCatName("");
    toast.success("Category added");
  };

  const handleDeleteCategory = (id: string) => {
    const updated = categories.filter((c) => c.id !== id);
    setCategories(updated);
    saveCategories(updated);
    toast.success("Category deleted");
  };

  const handleExport = () => {
    if (onExport) {
      onExport();
    } else {
      toast.info("Export: copy messages from the chat above");
    }
  };

  const inputDisabled = disabled || !modelsEnabled;
  const canSend = !inputDisabled && value.trim().length > 0;

  // Derived: selected provider/model names for the panel
  const selectedProviderObj = providers?.find((p) => p.id === selectedProviderId);
  const selectedModelObj = providerModels?.find((m) => m.id === selectedModelId);

  // =========================================================================
  // RENDER
  // =========================================================================

  return (
    <div className="rounded-2xl border bg-card shadow-sm">
      {/* ================================================================= */}
      {/* MODELS PANEL (Manus-style — above toolbar) */}
      {/* ================================================================= */}
      {showModelsPanel && (
        <div className="border-b bg-muted/30 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">Select Provider & Model</h3>
            <button
              onClick={closeModelsPanel}
              className="h-6 w-6 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Selected chip */}
          {selectedProviderObj && selectedModelObj && (
            <div className="flex flex-wrap gap-2 mb-3">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/20 rounded-full text-xs font-medium text-foreground">
                <div className={`w-2 h-2 rounded-full ${getProviderColor(selectedProviderObj.type)}`} />
                <span>{selectedProviderObj.name}: {selectedModelObj.name}</span>
                <button
                  onClick={() => onModelSelect?.(null)}
                  className="ml-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            {/* Provider Dropdown */}
            <div className="relative flex-1 min-w-[180px]">
              <button
                onClick={() => {
                  setShowProviderDropdown(!showProviderDropdown);
                  setShowModelDropdown(false);
                }}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-background border border-border rounded-lg text-sm hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-2">
                  {selectedProviderObj ? (
                    <>
                      <div className={`w-2 h-2 rounded-full ${getProviderColor(selectedProviderObj.type)}`} />
                      <span>{selectedProviderObj.name}</span>
                    </>
                  ) : (
                    <>
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Select Provider</span>
                    </>
                  )}
                </div>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showProviderDropdown ? "rotate-180" : ""}`} />
              </button>

              {showProviderDropdown && (
                <>
                  <div className="fixed inset-0 z-[199]" onClick={() => setShowProviderDropdown(false)} />
                  <div className="absolute top-full left-0 right-0 mt-1 z-[200] bg-popover border border-border rounded-lg shadow-lg max-h-[300px] overflow-y-auto">
                    {providersLoading ? (
                      <div className="flex items-center justify-center p-4">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </div>
                    ) : providers && providers.length > 0 ? (
                      providers.map((provider) => (
                        <button
                          key={provider.id}
                          onClick={() => handleProviderSelect(provider.id)}
                          className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted text-left transition-colors ${
                            provider.id === selectedProviderId ? "bg-primary/10 text-primary" : "text-popover-foreground"
                          }`}
                        >
                          <div className={`w-2 h-2 rounded-full ${getProviderColor(provider.type)}`} />
                          <span>{provider.name}</span>
                        </button>
                      ))
                    ) : (
                      <div className="p-4 text-sm text-muted-foreground text-center">
                        No providers configured
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Model Dropdown (shown after provider is selected) */}
            {selectedProviderId && (
              <div className="relative flex-1 min-w-[200px]">
                <button
                  onClick={() => {
                    setShowModelDropdown(!showModelDropdown);
                    setShowProviderDropdown(false);
                  }}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-background border border-border rounded-lg text-sm hover:bg-muted transition-colors"
                >
                  <span className={selectedModelObj ? "text-foreground" : "text-muted-foreground"}>
                    {selectedModelObj ? selectedModelObj.name : "Select Model"}
                  </span>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showModelDropdown ? "rotate-180" : ""}`} />
                </button>

                {showModelDropdown && (
                  <>
                    <div className="fixed inset-0 z-[199]" onClick={() => setShowModelDropdown(false)} />
                    <div className="absolute top-full left-0 right-0 mt-1 z-[200] bg-popover border border-border rounded-lg shadow-lg max-h-[300px] overflow-y-auto">
                      {modelsLoadingProp ? (
                        <div className="flex items-center justify-center p-4">
                          <Loader2 className="h-4 w-4 animate-spin" />
                        </div>
                      ) : providerModels && providerModels.length > 0 ? (
                        providerModels.map((model) => (
                          <button
                            key={model.id}
                            onClick={() => handleModelSelectInPanel(model.id)}
                            className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted text-left transition-colors ${
                              model.id === selectedModelId ? "bg-primary/10 text-primary" : "text-popover-foreground"
                            }`}
                          >
                            <span>{model.name}</span>
                          </button>
                        ))
                      ) : (
                        <div className="p-4 text-sm text-muted-foreground text-center">
                          No models available
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Attachments preview */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 pt-3">
          {attachments.map((file, idx) => (
            <div
              key={idx}
              className="flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground"
            >
              <Paperclip className="h-3 w-3" />
              <span className="max-w-[100px] truncate">{file.name}</span>
              <button
                onClick={() => removeAttachment(idx)}
                className="ml-1 text-muted-foreground hover:text-foreground"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="p-3">
        {/* Toolbar row */}
        <div
          className={`flex items-center ${
            isMobile ? "flex-wrap justify-between gap-1 mb-2" : "gap-1 mb-2"
          }`}
        >
          {/* Menu Button with Dropdown */}
          <div className="relative">
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-foreground"
              onClick={handleMenuClick}
              title="Menu"
            >
              <Menu className="h-4 w-4" />
            </Button>

            {showMenuDropdown && (
              <>
                {/* Backdrop */}
                <div className="fixed inset-0 z-[9998]" onClick={closeDropdowns} />

                {/* Menu Dropdown */}
                <div className="absolute bottom-full left-0 mb-2 w-[280px] bg-popover border border-border rounded-xl shadow-2xl z-[9999] overflow-hidden">
                  <button
                    onClick={() => { onNewChat?.(); closeDropdowns(); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors text-popover-foreground hover:bg-muted"
                  >
                    <Plus className="h-4 w-4" />
                    <span>New Chat</span>
                  </button>

                  {onRenameChat && (
                    <button
                      onClick={() => { onRenameChat(); closeDropdowns(); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors text-popover-foreground hover:bg-muted"
                    >
                      <PenLine className="h-4 w-4" />
                      <span>Rename Chat</span>
                    </button>
                  )}

                  {onSaveChat && (
                    <button
                      onClick={() => { onSaveChat(); closeDropdowns(); }}
                      disabled={isSaved || messageCount === 0}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors text-popover-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Save className="h-4 w-4" />
                      <span>{isSaved ? "Saved \u2713" : "Save Chat"}</span>
                    </button>
                  )}

                  <button
                    onClick={() => { onNewChat?.(); closeDropdowns(); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors text-popover-foreground hover:bg-muted"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>Clear Chat</span>
                  </button>

                  {onAnalytics && (
                    <button
                      onClick={() => { onAnalytics(); closeDropdowns(); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors text-popover-foreground hover:bg-muted"
                    >
                      <BarChart3 className="h-4 w-4" />
                      <span>Analytics</span>
                    </button>
                  )}

                  <div className="border-t border-border my-1" />

                  {onArchiveChat && (
                    <button
                      onClick={() => { onArchiveChat(); closeDropdowns(); }}
                      disabled={messageCount === 0}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors text-popover-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Archive className="h-4 w-4" />
                      <span>Archive Chat</span>
                    </button>
                  )}

                  {onDeleteChat && (
                    <button
                      onClick={() => { onDeleteChat(); closeDropdowns(); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors text-destructive hover:bg-muted"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span>Delete Chat</span>
                    </button>
                  )}

                  <button
                    onClick={() => { handleExport(); closeDropdowns(); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors text-popover-foreground hover:bg-muted"
                  >
                    <Download className="h-4 w-4" />
                    <span>Export Chat</span>
                  </button>

                  {/* Recent Conversations */}
                  {recentChats && recentChats.length > 0 && (
                    <>
                      <div className="border-t border-border mt-1" />
                      <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase">
                        Recent Conversations
                      </div>
                      {recentChats.map((chat) => (
                        <button
                          key={chat.id}
                          onClick={() => { onSwitchChat?.(chat.id); closeDropdowns(); }}
                          className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors text-popover-foreground hover:bg-muted"
                        >
                          <MessageSquare className="h-4 w-4 shrink-0" />
                          <span className="truncate flex-1">{chat.title}</span>
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {timeAgo(chat.updatedAt)}
                          </span>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          {/* New Chat button */}
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-foreground"
            onClick={onNewChat}
            title="New Chat"
          >
            <Plus className="h-4 w-4" />
          </Button>

          {/* Providers pill — clicking opens Models panel */}
          <button
            onClick={handleProvidersClick}
            className={`h-7 px-2.5 text-xs font-semibold rounded-full transition-colors flex items-center gap-1 ${
              showModelsPanel
                ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
                : "bg-primary text-primary-foreground hover:bg-primary/80"
            }`}
            title={selectedProviderObj?.name || "Select Provider"}
          >
            <Sparkles className="h-3 w-3" />
            {providerCount} Provider{providerCount !== 1 ? "s" : ""}
          </button>

          {/* Presets button */}
          {(onPresetsClick || true) && (
            <button
              onClick={() => setShowPresetsModal(true)}
              className="h-7 px-2.5 bg-muted text-muted-foreground text-xs font-semibold rounded-full transition-colors hover:bg-muted/80 hover:text-foreground flex items-center gap-1"
              title="Presets"
            >
              <Sparkles className="h-3 w-3" />
              Presets
            </button>
          )}

          {/* Bot icon — only visible when models are active */}
          {modelsEnabled && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              title="AI Active"
              disabled
            >
              <Bot className="h-4 w-4" />
            </Button>
          )}

          {/* Settings Button with Dropdown (Manus-style) */}
          <div className="relative">
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-foreground"
              onClick={handleSettingsClick}
              title="Settings"
            >
              <Settings className="h-4 w-4" />
            </Button>

            {showSettingsDropdown && (
              <>
                {/* Backdrop */}
                <div className="fixed inset-0 z-[9998]" onClick={closeDropdowns} />

                {/* Settings Dropdown (Manus-style items) */}
                <div className="absolute bottom-full right-0 mb-2 w-[220px] bg-popover border border-border rounded-xl shadow-2xl z-[9999] overflow-visible">
                  {/* Header */}
                  <div className="px-4 py-3 border-b border-border">
                    <h3 className="text-sm font-semibold text-popover-foreground m-0">Settings</h3>
                  </div>

                  {/* Presets Setting */}
                  <button
                    onClick={() => { setShowPresetsModal(true); closeDropdowns(); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors text-popover-foreground hover:bg-muted"
                  >
                    <Sparkles className="h-4 w-4" />
                    <span>Presets Setting</span>
                  </button>

                  {/* Categories Setting */}
                  <button
                    onClick={() => { setShowCategoriesModal(true); closeDropdowns(); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors text-popover-foreground hover:bg-muted"
                  >
                    <LayoutGrid className="h-4 w-4" />
                    <span>Categories Setting</span>
                  </button>

                  {/* Theme with submenu */}
                  <div className="relative">
                    <button
                      onClick={() => setShowThemeSubmenu(!showThemeSubmenu)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors text-popover-foreground hover:bg-muted"
                    >
                      <Palette className="h-4 w-4" />
                      <span className="flex-1">Chat Theme</span>
                      <span className="text-xs text-muted-foreground">
                        {theme === "light" ? "Light" : theme === "dark" ? "Dark" : "System"}
                      </span>
                    </button>

                    {showThemeSubmenu && (
                      <div className="absolute left-full top-0 ml-1 w-32 bg-popover border border-border rounded-lg shadow-lg z-[10000]">
                        <button
                          onClick={() => { setTheme("light"); closeDropdowns(); }}
                          className={`w-full px-4 py-2 text-left text-sm transition-colors hover:bg-muted ${
                            theme === "light" ? "bg-primary/10 text-primary" : "text-popover-foreground"
                          }`}
                        >
                          <Sun className="h-3.5 w-3.5 inline mr-2" />
                          Light
                        </button>
                        <button
                          onClick={() => { setTheme("dark"); closeDropdowns(); }}
                          className={`w-full px-4 py-2 text-left text-sm transition-colors hover:bg-muted ${
                            theme === "dark" ? "bg-primary/10 text-primary" : "text-popover-foreground"
                          }`}
                        >
                          <Moon className="h-3.5 w-3.5 inline mr-2" />
                          Dark
                        </button>
                        <button
                          onClick={() => { setTheme("system"); closeDropdowns(); }}
                          className={`w-full px-4 py-2 text-left text-sm transition-colors hover:bg-muted ${
                            theme === "system" ? "bg-primary/10 text-primary" : "text-popover-foreground"
                          }`}
                        >
                          <Monitor className="h-3.5 w-3.5 inline mr-2" />
                          System
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Language */}
                  <button
                    onClick={() => { toast.info("Language settings coming soon"); closeDropdowns(); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors text-popover-foreground hover:bg-muted"
                  >
                    <Globe className="h-4 w-4" />
                    <span>Language</span>
                  </button>

                  {/* Divider */}
                  <div className="border-t border-border my-1" />

                  {/* Export Data */}
                  <button
                    onClick={() => { handleExport(); closeDropdowns(); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors text-popover-foreground hover:bg-muted"
                  >
                    <Download className="h-4 w-4" />
                    <span>Export Data</span>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Save button */}
          {onSaveChat && (
            <Button
              variant="ghost"
              size="icon-sm"
              className={isSaved ? "text-green-500" : "text-muted-foreground hover:text-foreground"}
              onClick={onSaveChat}
              disabled={isSaved || messageCount === 0}
              title={isSaved ? "Chat saved" : "Save chat"}
            >
              <Save className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Input area */}
        <div className="flex flex-col">
          {/* Hidden file inputs */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileUpload}
          />
          {onImportData && (
            <input
              ref={importInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onImportData(file);
                e.target.value = "";
              }}
            />
          )}

          {/* Textarea spanning full width with icons inside */}
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={!modelsEnabled ? "Select models first..." : disabled ? "Select a provider first..." : placeholder}
              disabled={inputDisabled || isStreaming}
              rows={1}
              className="w-full resize-none rounded-2xl border bg-muted/50 pl-4 pr-12 pt-2.5 pb-10 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50"
              style={{ lineHeight: "1.5", minHeight: "56px", maxHeight: "200px" }}
            />

            {/* Bottom row inside textarea: icons left, send right */}
            <div className="absolute left-2 right-2 bottom-2 flex items-center justify-between">
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="h-7 w-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors"
                  title="Attach files"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                <button
                  className="h-7 w-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors"
                  title="Connect"
                  onClick={() => toast.info("Connectors coming soon")}
                >
                  <Plug className="h-3.5 w-3.5" />
                </button>
                <button
                  className="h-7 w-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors"
                  title="Voice"
                  onClick={() => toast.info("Voice input coming soon")}
                >
                  <Mic className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Send/Stop button */}
              {isStreaming ? (
                <button
                  onClick={onStop}
                  className="h-7 w-7 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground transition-colors"
                  title="Stop generating"
                >
                  <Square className="h-3 w-3" />
                </button>
              ) : (
                <button
                  onClick={onSend}
                  disabled={!canSend}
                  className="h-7 w-7 flex items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Send message (Enter)"
                >
                  {inputDisabled ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <SendIcon className="h-4 w-4" />
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* ================================================================= */}
      {/* PRESETS MANAGEMENT MODAL */}
      {/* ================================================================= */}
      <Dialog open={showPresetsModal} onOpenChange={setShowPresetsModal}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Presets Setting</DialogTitle>
          </DialogHeader>

          {/* Existing presets */}
          <div className="space-y-2 mt-2">
            {presets.map((preset) => (
              <div key={preset.id} className="flex items-start gap-2 p-3 rounded-lg border bg-muted/30">
                {editingPresetId === preset.id ? (
                  <div className="flex-1 space-y-2">
                    <input
                      className="w-full px-2 py-1 text-sm bg-background border border-border rounded"
                      value={preset.name}
                      onChange={(e) => {
                        const updated = presets.map((p) => p.id === preset.id ? { ...p, name: e.target.value } : p);
                        setPresets(updated);
                      }}
                    />
                    <textarea
                      className="w-full px-2 py-1 text-sm bg-background border border-border rounded resize-none"
                      rows={2}
                      value={preset.prompt}
                      onChange={(e) => {
                        const updated = presets.map((p) => p.id === preset.id ? { ...p, prompt: e.target.value } : p);
                        setPresets(updated);
                      }}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleUpdatePreset(preset.id, preset.name, preset.prompt)}
                        className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/80"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingPresetId(null)}
                        className="px-3 py-1 text-xs bg-muted text-muted-foreground rounded hover:bg-muted/80"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{preset.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{preset.prompt}</div>
                    </div>
                    <button
                      onClick={() => handleUsePreset(preset)}
                      className="px-2 py-1 text-xs bg-primary/10 text-primary rounded hover:bg-primary/20 shrink-0"
                    >
                      Use
                    </button>
                    <button
                      onClick={() => setEditingPresetId(preset.id)}
                      className="p-1 text-muted-foreground hover:text-foreground shrink-0"
                    >
                      <PenLine className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeletePreset(preset.id)}
                      className="p-1 text-muted-foreground hover:text-destructive shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Add new preset */}
          <div className="border-t pt-3 mt-3 space-y-2">
            <div className="text-sm font-medium">Add New Preset</div>
            <input
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg"
              placeholder="Preset name"
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
            />
            <textarea
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg resize-none"
              placeholder="Prompt template..."
              rows={2}
              value={newPresetPrompt}
              onChange={(e) => setNewPresetPrompt(e.target.value)}
            />
            <button
              onClick={handleAddPreset}
              disabled={!newPresetName.trim()}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/80 disabled:opacity-50"
            >
              Add Preset
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ================================================================= */}
      {/* CATEGORIES SETTING MODAL */}
      {/* ================================================================= */}
      <Dialog open={showCategoriesModal} onOpenChange={setShowCategoriesModal}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Categories Setting</DialogTitle>
          </DialogHeader>

          {/* Existing categories */}
          <div className="space-y-2 mt-2">
            {categories.map((cat) => (
              <div key={cat.id} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                <div className={`w-4 h-4 rounded-full ${cat.color} shrink-0`} />
                <span className="text-sm font-medium flex-1">{cat.name}</span>
                <button
                  onClick={() => handleDeleteCategory(cat.id)}
                  className="p-1 text-muted-foreground hover:text-destructive shrink-0"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* Add new category */}
          <div className="border-t pt-3 mt-3 space-y-2">
            <div className="text-sm font-medium">Add New Category</div>
            <input
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg"
              placeholder="Category name"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Color:</span>
              {CATEGORY_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setNewCatColor(c)}
                  className={`w-6 h-6 rounded-full ${c} transition-transform ${
                    newCatColor === c ? "ring-2 ring-primary ring-offset-2 ring-offset-background scale-110" : ""
                  }`}
                />
              ))}
            </div>
            <button
              onClick={handleAddCategory}
              disabled={!newCatName.trim()}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/80 disabled:opacity-50"
            >
              Add Category
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ChatControlBox;
