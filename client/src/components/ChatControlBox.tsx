import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Clock,
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
  /** Current input value */
  value: string;
  /** Input change callback */
  onChange: (value: string) => void;
  /** Send message callback */
  onSend: () => void;
  /** Whether AI is currently streaming a response */
  isStreaming?: boolean;
  /** Whether the input is disabled (no provider, etc.) */
  disabled?: boolean;
  /** Number of configured providers */
  providerCount?: number;
  /** Name of the currently selected provider */
  providerName?: string;
  /** Number of available models for the selected provider */
  modelCount?: number;
  /** Name of the currently selected model */
  modelName?: string;
  /** Whether models are toggled on (active) */
  modelsEnabled?: boolean;
  /** Callback to toggle models on/off */
  onModelsToggle?: () => void;
  /** Callback for "Models" button click */
  onModelsClick?: () => void;
  /** Callback for "New Chat" action */
  onNewChat?: () => void;
  /** Callback for "Stop" action during streaming */
  onStop?: () => void;
  /** Custom placeholder text */
  placeholder?: string;
  /** Optional no-provider warning message */
  noProviderMessage?: string;
  /** Callback for "Save Chat" action */
  onSaveChat?: () => void;
  /** Whether current chat is saved */
  isSaved?: boolean;
  /** Number of messages in current chat */
  messageCount?: number;
  /** Callback for "Export Chat" action */
  onExport?: () => void;
  /** Callback for "Presets" action */
  onPresetsClick?: () => void;
  /** Menu dropdown: rename chat */
  onRenameChat?: () => void;
  /** Menu dropdown: archive chat */
  onArchiveChat?: () => void;
  /** Menu dropdown: delete chat */
  onDeleteChat?: () => void;
  /** Menu dropdown: show analytics */
  onAnalytics?: () => void;
  /** Menu dropdown: switch to a recent chat */
  onSwitchChat?: (id: string) => void;
  /** Menu dropdown: recent conversations */
  recentChats?: Array<{ id: string; title: string; messageCount: number; updatedAt: string }>;
  /** Settings dropdown: export all data */
  onExportAll?: () => void;
  /** Settings dropdown: import data via file picker */
  onImportData?: (file: File) => void;
  /** Settings dropdown: clear all data */
  onClearAllData?: () => void;
  /** Settings dropdown: auto-save toggle state */
  autoSave?: boolean;
  /** Settings dropdown: auto-save toggle callback */
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
  const { setTheme } = useTheme();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<File[]>([]);

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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter") {
      if (e.shiftKey) {
        // Shift+Enter → newline (default behavior, no preventDefault)
        return;
      }
      if (!isMobile) {
        // Enter on desktop → send
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

  const handleClear = () => {
    if (onNewChat) onNewChat();
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
          {/* Menu dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-foreground"
              >
                <Menu className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-60">
              <DropdownMenuItem onClick={onNewChat}>
                <Plus className="h-4 w-4" />
                New Chat
              </DropdownMenuItem>
              {onRenameChat && (
                <DropdownMenuItem onClick={onRenameChat}>
                  <PenLine className="h-4 w-4" />
                  Rename Chat
                </DropdownMenuItem>
              )}
              {onSaveChat && (
                <DropdownMenuItem onClick={onSaveChat} disabled={isSaved || messageCount === 0}>
                  <Save className="h-4 w-4" />
                  Save Chat
                  {isSaved && (
                    <span className="ml-auto text-[10px] text-green-500 font-medium">Saved</span>
                  )}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={handleClear}>
                <Trash2 className="h-4 w-4" />
                Clear Chat
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {onAnalytics && (
                <DropdownMenuItem onClick={onAnalytics}>
                  <BarChart3 className="h-4 w-4" />
                  Analytics
                </DropdownMenuItem>
              )}
              {onArchiveChat && (
                <DropdownMenuItem onClick={onArchiveChat} disabled={messageCount === 0}>
                  <Archive className="h-4 w-4" />
                  Archive Chat
                </DropdownMenuItem>
              )}
              {onDeleteChat && (
                <DropdownMenuItem onClick={onDeleteChat} className="text-destructive focus:text-destructive">
                  <Trash2 className="h-4 w-4" />
                  Delete Chat
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleExport}>
                <Download className="h-4 w-4" />
                Export Chat
              </DropdownMenuItem>

              {/* Recent conversations */}
              {recentChats && recentChats.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    Recent Conversations
                  </DropdownMenuLabel>
                  {recentChats.map((chat) => (
                    <DropdownMenuItem
                      key={chat.id}
                      onClick={() => onSwitchChat?.(chat.id)}
                      className="flex items-center gap-2"
                    >
                      <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate flex-1">{chat.title}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {timeAgo(chat.updatedAt)}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

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

          {/* Models toggle button (matches Claude repo behavior) */}
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

          {/* Settings dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-foreground"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="w-52">
              {onAutoSaveChange && (
                <DropdownMenuItem onClick={() => onAutoSaveChange(!autoSave)}>
                  <Save className="h-4 w-4" />
                  Auto-Save
                  <span className={`ml-auto text-[10px] font-medium ${autoSave ? "text-green-500" : "text-muted-foreground"}`}>
                    {autoSave ? "ON" : "OFF"}
                  </span>
                </DropdownMenuItem>
              )}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Palette className="h-4 w-4" />
                  Theme
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onClick={() => setTheme("light")}>
                    <Sun className="h-4 w-4" />
                    Light
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setTheme("dark")}>
                    <Moon className="h-4 w-4" />
                    Dark
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setTheme("system")}>
                    <Monitor className="h-4 w-4" />
                    System
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleExport}>
                <Download className="h-4 w-4" />
                Export Current Chat
              </DropdownMenuItem>
              {onExportAll && (
                <DropdownMenuItem onClick={onExportAll}>
                  <Download className="h-4 w-4" />
                  Export All Data
                </DropdownMenuItem>
              )}
              {onImportData && (
                <DropdownMenuItem onClick={() => importInputRef.current?.click()}>
                  <Upload className="h-4 w-4" />
                  Import Data
                </DropdownMenuItem>
              )}
              {onClearAllData && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onClearAllData} className="text-destructive focus:text-destructive">
                    <Trash2 className="h-4 w-4" />
                    Clear All Data
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

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
                {/* Paperclip */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="h-7 w-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors"
                  title="Attach files"
                >
                  <Paperclip className="h-4 w-4" />
                </button>

                {/* Plug */}
                <button
                  className="h-7 w-7 flex items-center justify-center rounded-full text-muted-foreground"
                  title="Connect"
                  disabled
                >
                  <Plug className="h-3.5 w-3.5" />
                </button>

                {/* Mic */}
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
