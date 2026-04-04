/**
 * OpenCode Chat — App Component demo page
 *
 * Exact replica of the OpenCode mobile chat session interface.
 * Source: opencode-chat.html (mobile browser capture, 430px viewport)
 * Layout: status bar → address bar → app header → tab bar → session content → composer → nav bar
 */
import { useState, useRef, useEffect } from "react";
import {
  Menu,
  Grid3X3,
  Terminal,
  ChevronDown,
  Plus,
  Send,
  Shield,
  MoreVertical,
  Home,
  Info,
  ArrowRight,
  Square,
  ArrowLeft,
} from "lucide-react";

type TaskItem = {
  num: number;
  priority: "P1" | "P2";
  label: string;
};

const TASKS: TaskItem[] = [
  { num: 6, priority: "P1", label: "Replace mock implementations with real enforcement" },
  { num: 7, priority: "P1", label: "Remove hardcoded principals and encryption fallbacks" },
  { num: 8, priority: "P2", label: "Expand OPA policies or update docs to reflect TypeScript-based enforcement" },
];

export default function OpenCodeChatPage() {
  const [activeTab, setActiveTab] = useState<"session" | "changes">("session");
  const [cleared, setCleared] = useState(false);
  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    if (!message.trim()) return;
    setMessage("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  }, [message]);

  return (
    <div
      className="flex flex-col -mx-6 -mt-6 overflow-y-auto"
      style={{ height: "calc(100vh - 4rem)", background: "#111" }}
    >
      {/* ─── Live Preview ─── */}
      <div className="flex justify-center py-8 px-4 shrink-0">
        <div
          style={{
            border: "2px solid #2a2a2a",
            borderRadius: 24,
            overflow: "hidden",
            boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
          }}
        >
      <div
        className="flex flex-col overflow-hidden w-full"
        style={{
          maxWidth: 430,
          height: 780,
          fontFamily: "-apple-system, 'SF Pro Text', 'Helvetica Neue', sans-serif",
          background: "#0d0d0d",
          color: "#e8e8e8",
        }}
      >
        {/* Status Bar */}
        <div className="flex justify-between items-center shrink-0" style={{ padding: "10px 16px 6px" }}>
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.3 }}>11:31</span>
          <div className="flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ opacity: 0.9 }}>
              <line x1="1" y1="1" x2="23" y2="23" /><path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" /><path d="M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
            </svg>
            <svg width="16" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.9 }}>
              <path d="M5 12.55a11 11 0 0114.08 0" /><path d="M1.42 9a16 16 0 0121.16 0" /><path d="M8.53 16.11a6 6 0 016.95 0" /><circle cx="12" cy="20" r="1" />
            </svg>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.9 }}>
              <rect x="1" y="15" width="4" height="9" rx="1" /><rect x="7" y="10" width="4" height="14" rx="1" /><rect x="13" y="5" width="4" height="19" rx="1" /><rect x="19" y="1" width="4" height="23" rx="1" opacity="0.4" />
            </svg>
            <span
              style={{
                background: "#e8e8e8",
                borderRadius: 3,
                padding: "2px 4px",
                fontSize: 11,
                fontWeight: 700,
                color: "#000",
                minWidth: 26,
                textAlign: "center",
              }}
            >
              76
            </span>
          </div>
        </div>

        {/* Address Bar */}
        <div className="flex items-center gap-3 shrink-0" style={{ padding: "4px 12px 8px" }}>
          <Home size={20} style={{ color: "#888", flexShrink: 0 }} />
          <div
            className="flex-1 flex items-center gap-1.5"
            style={{
              background: "#1e1e1e",
              border: "1px solid #2a2a2a",
              borderRadius: 20,
              padding: "6px 12px",
              fontSize: 13,
              color: "#888",
            }}
          >
            <span
              style={{
                width: 14,
                height: 14,
                border: "1px solid #555",
                borderRadius: "50%",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
                fontStyle: "italic",
                fontFamily: "serif",
                color: "#555",
                flexShrink: 0,
              }}
            >
              i
            </span>
            <span>127.0.0.1:4096/Lw/se</span>
          </div>
          <div className="flex items-center gap-3.5" style={{ color: "#888" }}>
            <Plus size={18} />
            <span
              style={{
                background: "#333",
                borderRadius: 4,
                padding: "2px 6px",
                fontSize: 12,
                fontWeight: 600,
                color: "#e8e8e8",
              }}
            >
              3
            </span>
            <MoreVertical size={18} />
          </div>
        </div>

        {/* App Header */}
        <div
          className="flex justify-between items-center shrink-0"
          style={{ padding: "8px 14px", borderBottom: "1px solid #2a2a2a" }}
        >
          <div className="flex flex-col justify-center gap-1 cursor-pointer" style={{ width: 32, height: 32, padding: 4 }}>
            <span style={{ display: "block", height: 2, background: "#888", borderRadius: 2, width: 20 }} />
            <span style={{ display: "block", height: 2, background: "#888", borderRadius: 2, width: 20 }} />
            <span style={{ display: "block", height: 2, background: "#888", borderRadius: 2, width: 20 }} />
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex items-center justify-center" style={{ width: 32, height: 32, color: "#888", borderRadius: 6 }}>
              <Grid3X3 size={18} />
              <div style={{ position: "absolute", top: 6, right: 6, width: 6, height: 6, background: "#4caf50", borderRadius: "50%" }} />
            </div>
            <div className="flex items-center justify-center" style={{ width: 32, height: 32, color: "#888", borderRadius: 6 }}>
              <Terminal size={18} />
            </div>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="flex shrink-0" style={{ background: "#0d0d0d" }}>
          {(["session", "changes"] as const).map((tab) => (
            <div
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="flex-1 text-center cursor-pointer"
              style={{
                padding: "10px 0",
                fontSize: 15,
                fontWeight: activeTab === tab ? 600 : 500,
                color: activeTab === tab ? "#e8e8e8" : "#666",
                borderBottom: activeTab === tab ? "2px solid #e8e8e8" : "2px solid transparent",
                transition: "all 0.15s",
              }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </div>
          ))}
        </div>

        {/* Session Content */}
        <div
          className="flex-1 flex flex-col overflow-y-auto"
          style={{ padding: "16px 14px", scrollbarWidth: "none" }}
        >
          {!cleared ? (
            <>
              {/* Session Title */}
              <div className="flex items-center justify-between gap-2.5" style={{ marginBottom: 14 }}>
                <span
                  className="flex-1 truncate"
                  style={{ fontSize: 15, fontWeight: 600 }}
                >
                  How to Analyze Data Using Python: Secrets...
                </span>
                <div className="flex items-center gap-2.5 shrink-0">
                  <div
                    style={{
                      width: 16,
                      height: 16,
                      border: "2px solid #2a2a2a",
                      borderTopColor: "#888",
                      borderRadius: "50%",
                      animation: "spin 0.8s linear infinite",
                    }}
                  />
                  <span style={{ color: "#888", fontSize: 18, letterSpacing: 1, cursor: "pointer" }}>···</span>
                </div>
              </div>

              {/* Task List */}
              <div className="flex flex-col">
                {TASKS.map((task) => (
                  <div key={task.num} className="flex gap-3 items-start" style={{ padding: "7px 0" }}>
                    <span
                      style={{
                        fontSize: 14,
                        color: "#555",
                        minWidth: 20,
                        textAlign: "right",
                        paddingTop: 1,
                        flexShrink: 0,
                      }}
                    >
                      {task.num}.
                    </span>
                    <span style={{ fontSize: 14, lineHeight: 1.5 }}>
                      <span
                        style={{
                          fontWeight: 700,
                          color: task.priority === "P1" ? "#e8e8e8" : "#888",
                          marginRight: 2,
                        }}
                      >
                        {task.priority}:
                      </span>{" "}
                      {task.label}
                    </span>
                  </div>
                ))}
              </div>

              {/* Clear Button */}
              <div className="flex justify-end" style={{ marginTop: 24, marginBottom: 8 }}>
                <button
                  onClick={() => setCleared(true)}
                  style={{
                    background: "#1c1c1c",
                    border: "1px solid #2a2a2a",
                    color: "#e8e8e8",
                    fontSize: 14,
                    padding: "10px 18px",
                    borderRadius: 8,
                    cursor: "pointer",
                  }}
                >
                  Clear conversation
                </button>
              </div>
            </>
          ) : (
            /* Cleared Notice */
            <div className="flex items-center gap-2.5" style={{ padding: "16px 0 4px", color: "#888", fontSize: 14 }}>
              <div
                className="flex items-center justify-center shrink-0"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  border: "1px solid #2a2a2a",
                  background: "#1c1c1c",
                  cursor: "pointer",
                }}
              >
                <ChevronDown size={14} />
              </div>
              <span>Conversation cleared. What would you like to work on?</span>
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="shrink-0" style={{ background: "#0d0d0d", padding: "8px 12px 12px", borderTop: "1px solid #2a2a2a" }}>
          <div
            style={{
              background: "#1a1a1a",
              border: "1px solid #2a2a2a",
              borderRadius: 14,
              padding: "10px 12px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              marginBottom: 8,
            }}
          >
            <textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything..."
              rows={1}
              style={{
                background: "none",
                border: "none",
                outline: "none",
                color: "#e8e8e8",
                fontSize: 15,
                resize: "none",
                width: "100%",
                fontFamily: "inherit",
                lineHeight: 1.4,
                minHeight: 22,
                caretColor: "#e8e8e8",
              }}
            />
            <div className="flex justify-between items-center">
              <div
                className="flex items-center justify-center cursor-pointer"
                style={{ width: 28, height: 28, color: "#888", fontSize: 20, fontWeight: 300 }}
              >
                +
              </div>
              <div
                onClick={handleSend}
                className="flex items-center justify-center cursor-pointer"
                style={{
                  width: 34,
                  height: 34,
                  background: "#888",
                  borderRadius: 8,
                  transition: "background 0.15s",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                  <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
                </svg>
              </div>
            </div>
          </div>

          {/* Bottom Toolbar */}
          <div className="flex items-center" style={{ padding: "0 2px" }}>
            <div className="flex items-center gap-1.5 cursor-pointer" style={{ padding: "4px 8px", fontSize: 13, color: "#888", borderRadius: 6 }}>
              Plan <span style={{ fontSize: 10, opacity: 0.6 }}>▾</span>
            </div>
            <span style={{ color: "#2a2a2a", fontSize: 16, padding: "0 2px" }}>|</span>
            <div className="flex items-center gap-1.5 cursor-pointer" style={{ padding: "4px 8px", fontSize: 13, color: "#888", borderRadius: 6 }}>
              <span
                style={{
                  width: 14,
                  height: 14,
                  background: "#e8d5b0",
                  borderRadius: 3,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 8,
                  color: "#5a3e00",
                  fontWeight: 900,
                }}
              >
                Z
              </span>
              Qwen3.6 Plus Free <span style={{ fontSize: 10, opacity: 0.6 }}>▾</span>
            </div>
            <span style={{ color: "#2a2a2a", fontSize: 16, padding: "0 2px" }}>|</span>
            <div className="flex items-center gap-1.5 cursor-pointer" style={{ padding: "4px 8px", fontSize: 13, color: "#888", borderRadius: 6 }}>
              Default <span style={{ fontSize: 10, opacity: 0.6 }}>▾</span>
            </div>
            <div className="ml-auto cursor-pointer" style={{ color: "#555", padding: "4px 8px" }}>
              <Shield size={16} />
            </div>
          </div>
        </div>

        {/* Nav Bar (Android) */}
        <div className="flex justify-around items-end shrink-0" style={{ padding: "8px 24px 16px" }}>
          <div className="flex flex-col items-center cursor-pointer" style={{ color: "#888", minWidth: 60 }}>
            <ArrowRight size={22} />
          </div>
          <div className="flex flex-col items-center cursor-pointer" style={{ color: "#888", minWidth: 60 }}>
            <Square size={22} />
          </div>
          <div className="flex flex-col items-center cursor-pointer" style={{ color: "#888", minWidth: 60 }}>
            <ArrowLeft size={22} />
          </div>
        </div>
      </div>

        {/* Spinner keyframe */}
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
        </div>
      </div>

      {/* ─── Source Code ─── */}
      <div className="px-4 pb-12 mx-auto w-full" style={{ maxWidth: 900 }}>
        <div style={{ borderTop: "1px solid #2a2a2a", paddingTop: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e8e8e8", marginBottom: 4 }}>Source Code</h2>
          <p style={{ fontSize: 13, color: "#888", marginBottom: 16 }}>opencode-chat.html — Mobile chat session interface (430px viewport)</p>

          <div style={{ background: "#0a0a0a", border: "1px solid #1e1e1e", borderRadius: 10, overflow: "hidden" }}>
            {/* Header bar */}
            <div className="flex items-center justify-between" style={{ padding: "8px 14px", borderBottom: "1px solid #1e1e1e" }}>
              <div className="flex items-center gap-2">
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ff5f57" }} />
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#febc2e" }} />
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#28c840" }} />
              </div>
              <span style={{ fontSize: 11, color: "#555" }}>OpenCodeChatPage.tsx</span>
              <div style={{ width: 44 }} />
            </div>

            {/* Code content */}
            <pre style={{
              margin: 0,
              padding: "16px 20px",
              fontSize: 12,
              lineHeight: 1.7,
              fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
              color: "#a1a7b4",
              overflowX: "auto",
              tabSize: 2,
            }}>{SOURCE_CODE}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Source code (the original HTML from the download file) ─── */
const SOURCE_CODE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<title>OpenCode Chat</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box;
      -webkit-tap-highlight-color: transparent; }

  :root {
    --bg: #0d0d0d;
    --bg2: #151515;
    --bg3: #1c1c1c;
    --border: #2a2a2a;
    --text: #e8e8e8;
    --text-dim: #888;
    --text-muted: #555;
    --accent: #4caf50;
    --p1: #e8e8e8;
    --p2: #888;
    --tab-active: #e8e8e8;
    --tab-inactive: #666;
    --radius: 8px;
  }

  body {
    font-family: -apple-system, 'SF Pro Text', 'Helvetica Neue', sans-serif;
    background: var(--bg);
    color: var(--text);
    height: 100vh;
    display: flex;
    flex-direction: column;
    max-width: 430px;
    margin: 0 auto;
    position: relative;
    overflow: hidden;
  }

  /* ── Status Bar ── */
  .status-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 16px 6px;
    font-size: 15px;
    font-weight: 600;
    background: var(--bg);
    flex-shrink: 0;
  }
  .status-time { font-size: 15px; font-weight: 700;
                  letter-spacing: -0.3px; }
  .battery {
    background: var(--text);
    border-radius: 3px;
    padding: 2px 4px;
    font-size: 11px;
    font-weight: 700;
    color: #000;
    min-width: 26px;
    text-align: center;
  }

  /* ── Address Bar ── */
  .address-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 4px 12px 8px;
    background: var(--bg);
    flex-shrink: 0;
  }
  .addr-url {
    flex: 1;
    background: #1e1e1e;
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 6px 12px;
    font-size: 13px;
    color: var(--text-dim);
  }

  /* ── App Header ── */
  .app-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 14px;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .hamburger {
    width: 32px; height: 32px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 4px;
    padding: 4px;
  }
  .hamburger span {
    display: block;
    height: 2px;
    background: var(--text-dim);
    border-radius: 2px;
    width: 20px;
  }

  /* ── Tab Bar ── */
  .tab-bar { display: flex; background: var(--bg); flex-shrink: 0; }
  .tab {
    flex: 1;
    text-align: center;
    padding: 10px 0;
    font-size: 15px;
    font-weight: 500;
    color: var(--tab-inactive);
    border-bottom: 2px solid transparent;
    transition: all 0.15s;
  }
  .tab.active {
    color: var(--tab-active);
    border-bottom-color: var(--tab-active);
    font-weight: 600;
  }

  /* ── Session Content ── */
  .session-content {
    flex: 1;
    overflow-y: auto;
    padding: 16px 14px;
    display: flex;
    flex-direction: column;
  }
  .session-title {
    font-size: 15px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
  }
  .spinner {
    width: 16px; height: 16px;
    border: 2px solid var(--border);
    border-top-color: var(--text-dim);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Task Items ── */
  .task-item {
    display: flex;
    gap: 12px;
    padding: 7px 0;
    align-items: flex-start;
  }
  .task-num {
    font-size: 14px;
    color: var(--text-muted);
    min-width: 20px;
    text-align: right;
  }
  .task-label {
    font-size: 14px;
    line-height: 1.5;
  }
  .badge.p1 { color: var(--p1); font-weight: 700; }
  .badge.p2 { color: var(--p2); font-weight: 700; }

  /* ── Clear Button ── */
  .clear-btn {
    background: var(--bg3);
    border: 1px solid var(--border);
    color: var(--text);
    font-size: 14px;
    padding: 10px 18px;
    border-radius: var(--radius);
    cursor: pointer;
  }

  /* ── Composer ── */
  .composer {
    background: var(--bg);
    padding: 8px 12px 12px;
    border-top: 1px solid var(--border);
    flex-shrink: 0;
  }
  .composer-box {
    background: #1a1a1a;
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 8px;
  }
  .composer-input {
    background: none;
    border: none;
    outline: none;
    color: var(--text);
    font-size: 15px;
    resize: none;
    width: 100%;
    font-family: inherit;
    line-height: 1.4;
    min-height: 22px;
  }
  .send-btn {
    width: 34px; height: 34px;
    background: var(--text-dim);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* ── Bottom Toolbar ── */
  .tool-item {
    padding: 4px 8px;
    font-size: 13px;
    color: var(--text-dim);
    border-radius: 6px;
  }
  .model-icon {
    width: 14px; height: 14px;
    background: #e8d5b0;
    border-radius: 3px;
    font-size: 8px;
    color: #5a3e00;
    font-weight: 900;
  }

  /* ── Nav Bar ── */
  .nav-bar {
    display: flex;
    justify-content: space-around;
    padding: 8px 24px 16px;
    background: var(--bg);
    flex-shrink: 0;
  }
</style>
</head>
<body>
  <!-- Status Bar -->
  <div class="status-bar">
    <div class="status-time">11:31</div>
    <div class="status-icons">...</div>
  </div>

  <!-- Address Bar -->
  <div class="address-bar">
    <div class="addr-home">🏠</div>
    <div class="addr-url">ⓘ 127.0.0.1:4096/Lw/se</div>
    <div class="addr-actions">+ [3] ⋮</div>
  </div>

  <!-- App Header -->
  <div class="app-header">
    <div class="hamburger">☰</div>
    <div class="header-actions">[⊞•] [▶_]</div>
  </div>

  <!-- Tab Bar -->
  <div class="tab-bar">
    <div class="tab active">Session</div>
    <div class="tab">Changes</div>
  </div>

  <!-- Session Content -->
  <div class="session-content">
    <div class="session-title">
      How to Analyze Data Using Python... ◌ ···
    </div>
    <div class="task-list">
      <div class="task-item">
        <div class="task-num">6.</div>
        <div class="task-label">
          <span class="badge p1">P1:</span>
          Replace mock implementations with real enforcement
        </div>
      </div>
      <div class="task-item">
        <div class="task-num">7.</div>
        <div class="task-label">
          <span class="badge p1">P1:</span>
          Remove hardcoded principals and encryption fallbacks
        </div>
      </div>
      <div class="task-item">
        <div class="task-num">8.</div>
        <div class="task-label">
          <span class="badge p2">P2:</span>
          Expand OPA policies or update docs
        </div>
      </div>
    </div>
    <button class="clear-btn">Clear conversation</button>
  </div>

  <!-- Composer -->
  <div class="composer">
    <div class="composer-box">
      <textarea class="composer-input"
        placeholder="Ask anything..."></textarea>
      <div class="composer-actions">
        <div class="attach-btn">+</div>
        <div class="send-btn">⬆</div>
      </div>
    </div>
    <div class="bottom-toolbar">
      Plan ▾ | [Z] Qwen3.6 Plus Free ▾ | Default ▾ 🛡
    </div>
  </div>

  <!-- Nav Bar -->
  <div class="nav-bar">→  □  ←</div>

  <script>
    function switchTab(el) {
      document.querySelectorAll('.tab')
        .forEach(t => t.classList.remove('active'));
      el.classList.add('active');
    }

    function clearConversation() {
      document.querySelector('.task-list').style.display = 'none';
      document.querySelector('.clear-btn').style.display = 'none';
      document.querySelector('.session-title').style.display = 'none';
    }

    function handleKey(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    }

    function sendMessage() {
      const ta = document.querySelector('.composer-input');
      const val = ta.value.trim();
      if (!val) return;
      ta.value = '';
      ta.style.height = 'auto';
    }
  <\/script>
</body>
</html>`;
