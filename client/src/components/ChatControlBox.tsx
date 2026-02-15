import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
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
} from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";

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
}: ChatControlBoxProps) {
  const isMobile = useIsMobile();
  const { theme, setTheme } = useTheme();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<File[]>([]);

  // Manual dropdown state (matches Manud behavior)
  const [showMenuDropdown, setShowMenuDropdown] = useState(false);
  const [showSettingsDropdown, setShowSettingsDropdown] = useState(false);
  const [showThemeSubmenu, setShowThemeSubmenu] = useState(false);

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

  const handleExport = () => {
    if (onExport) {
      onExport();
    } else {
      toast.info("Export: copy messages from the chat above");
    }
  };

  const inputDisabled = disabled || !modelsEnabled;
  const canSend = !inputDisabled && value.trim().length > 0;

  // =========================================================================
  // RENDER
  // =========================================================================

  return (
    <div className="rounded-2xl border bg-card shadow-sm">
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
          {/* Menu Button with Dropdown (Manud pattern) */}
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
                  {/* Main actions */}
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

                  {/* Divider */}
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

          {/* Providers pill */}
          <button
            className="h-7 px-2.5 bg-primary text-primary-foreground text-xs font-semibold rounded-full transition-colors hover:bg-primary/80 flex items-center gap-1"
            title={providerName || "Providers"}
          >
            <Sparkles className="h-3 w-3" />
            {providerCount} Provider{providerCount !== 1 ? "s" : ""}
          </button>

          {/* Models toggle button */}
          {onModelsToggle && (
            <button
              onClick={onModelsToggle}
              className={`h-7 px-2.5 text-xs font-semibold rounded-full transition-colors flex items-center gap-1 ${
                modelsEnabled
                  ? "bg-blue-600 text-white hover:bg-blue-500"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
              title={modelsEnabled ? "Models active — click to deactivate" : "Click to activate models"}
            >
              {modelsEnabled ? modelCount : 0} Model{modelCount !== 1 ? "s" : ""}
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

          {/* Settings Button with Dropdown (Manud pattern) */}
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

                {/* Settings Dropdown */}
                <div className="absolute bottom-full right-0 mb-2 w-[220px] bg-popover border border-border rounded-xl shadow-2xl z-[9999] overflow-visible">
                  {/* Header */}
                  <div className="px-4 py-3 border-b border-border">
                    <h3 className="text-sm font-semibold text-popover-foreground m-0">Settings</h3>
                  </div>

                  {/* Auto-Save Toggle */}
                  {onAutoSaveChange && (
                    <button
                      onClick={() => { onAutoSaveChange(!autoSave); closeDropdowns(); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors text-popover-foreground hover:bg-muted"
                    >
                      <Save className="h-4 w-4" />
                      <span className="flex-1">Auto-Save</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                        autoSave ? "bg-green-500/20 text-green-500" : "bg-muted text-muted-foreground"
                      }`}>
                        {autoSave ? "ON" : "OFF"}
                      </span>
                    </button>
                  )}

                  {/* Theme with submenu */}
                  <div className="relative">
                    <button
                      onClick={() => setShowThemeSubmenu(!showThemeSubmenu)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors text-popover-foreground hover:bg-muted"
                    >
                      <Palette className="h-4 w-4" />
                      <span className="flex-1">Theme</span>
                      <span className="text-xs text-muted-foreground">
                        {theme === "light" ? "☀️" : theme === "dark" ? "🌙" : "🔄"}
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

                  {/* Divider */}
                  <div className="border-t border-border my-1" />

                  {/* Export Current Chat */}
                  <button
                    onClick={() => { handleExport(); closeDropdowns(); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors text-popover-foreground hover:bg-muted"
                  >
                    <Download className="h-4 w-4" />
                    <span>Export Current Chat</span>
                  </button>

                  {/* Export All */}
                  {onExportAll && (
                    <button
                      onClick={() => { onExportAll(); closeDropdowns(); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors text-popover-foreground hover:bg-muted"
                    >
                      <Download className="h-4 w-4" />
                      <span>Export All Data</span>
                    </button>
                  )}

                  {/* Import */}
                  {onImportData && (
                    <button
                      onClick={() => { importInputRef.current?.click(); closeDropdowns(); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors text-popover-foreground hover:bg-muted"
                    >
                      <Upload className="h-4 w-4" />
                      <span>Import Data</span>
                    </button>
                  )}

                  {/* Clear All Data */}
                  {onClearAllData && (
                    <>
                      <div className="border-t border-border my-1" />
                      <button
                        onClick={() => { onClearAllData(); closeDropdowns(); }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors text-destructive hover:bg-muted"
                      >
                        <Trash2 className="h-4 w-4" />
                        <span>Clear All Data</span>
                      </button>
                    </>
                  )}
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

          {/* Presets button */}
          {onPresetsClick && (
            <button
              onClick={onPresetsClick}
              className="h-7 px-2.5 bg-muted text-muted-foreground text-xs font-semibold rounded-full transition-colors hover:bg-muted/80 hover:text-foreground flex items-center gap-1"
              title="Presets"
            >
              Presets
            </button>
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
                  className="h-7 w-7 flex items-center justify-center rounded-full text-muted-foreground"
                  title="Connect"
                  disabled
                >
                  <Plug className="h-3.5 w-3.5" />
                </button>
                <button
                  className="h-7 w-7 flex items-center justify-center rounded-full text-muted-foreground"
                  title="Voice"
                  disabled
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
    </div>
  );
}

export default ChatControlBox;
