import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Menu,
  Plus,
  Settings,
  Paperclip,
  ArrowUp,
  Bot,
  Trash2,
  Download,
  Loader2,
  Sparkles,
  Square,
  Save,
  Plug,
  Mic,
} from "lucide-react";
import { toast } from "sonner";

// =============================================================================
// RESPONSIVE HOOK (simplified inline version)
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
  /** Callback for "Presets" action */
  onPresetsClick?: () => void;
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
  onNewChat,
  onStop,
  placeholder = "Type your message...",
  noProviderMessage,
  onSaveChat,
  isSaved = false,
  messageCount = 0,
  onPresetsClick,
}: ChatControlBoxProps) {
  const isMobile = useIsMobile();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
    if (e.key === "Enter" && (e.shiftKey || e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (!disabled && value.trim() && !isStreaming) {
        onSend();
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
    toast.info("Export: copy messages from the chat above");
  };

  const handleClear = () => {
    if (onNewChat) onNewChat();
  };

  const canSend = !disabled && value.trim().length > 0;

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
            <DropdownMenuContent align="start" side="top" className="w-56">
              <DropdownMenuItem onClick={onNewChat}>
                <Plus className="h-4 w-4" />
                New Chat
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleClear}>
                <Trash2 className="h-4 w-4" />
                Clear Chat
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleExport}>
                <Download className="h-4 w-4" />
                Export Chat
              </DropdownMenuItem>
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

          {/* Models pill */}
          <button
            className="h-7 px-2.5 bg-primary text-primary-foreground text-xs font-semibold rounded-full transition-colors hover:bg-primary/80 flex items-center gap-1"
            title={providerName || "Providers"}
          >
            <Sparkles className="h-3 w-3" />
            {providerCount} Provider{providerCount !== 1 ? "s" : ""}
          </button>

          {/* Bot icon */}
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            title="AI Assistant"
            disabled
          >
            <Bot className="h-4 w-4" />
          </Button>

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
            <DropdownMenuContent align="end" side="top" className="w-48">
              <DropdownMenuItem onClick={handleExport}>
                <Download className="h-4 w-4" />
                Export Data
              </DropdownMenuItem>
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
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileUpload}
          />

          {/* Textarea spanning full width with icons inside */}
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={disabled ? "Select a provider first..." : placeholder}
              disabled={disabled || isStreaming}
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
                  title="Send message"
                >
                  {disabled ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowUp className="h-4 w-4" strokeWidth={2.125} />
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
