/**
 * OpenCode Home — App Component demo page
 *
 * Combines: opencode-home.html (mobile capture) + deep repo audit of
 * packages/app/src/pages/home.tsx, layout.tsx, layout/sidebar-*.tsx
 *
 * Architecture:
 * - Sidebar rail (64–80px): hamburger, project avatars (drag-reorderable), add [+], settings, help
 * - Sidebar panel (280px): project name, path, "New session" button, session list
 * - Main content: home landing (logo, server status, recent projects) or session route
 * - Hover-peek: rail hover → floating panel overlay (desktop only)
 * - Mobile drawer: off-canvas slide from left
 * - Transitions: 200ms ease-out sidebar, 180ms ease-out peek in, 120ms ease-in peek out
 */
import { useState, useRef, useEffect, useCallback } from "react";
import {
  Menu,
  Plus,
  Settings,
  HelpCircle,
  Grid3X3,
  Terminal,
  MoreHorizontal,
  Home,
  MoreVertical,
  ArrowRight,
  Square,
  ArrowLeft,
  Archive,
  Edit3,
  Info,
  FolderPlus,
  ChevronRight,
} from "lucide-react";

/* ─── Data ─── */
type Project = {
  id: string;
  name: string;
  path: string;
  color: string;
  initials: string;
  sessions: Session[];
};

type Session = {
  id: string;
  title: string;
  working?: boolean;
  unseen?: boolean;
  hasError?: boolean;
};

const PROJECTS: Project[] = [
  {
    id: "p1",
    name: "MyNewAp1Claude",
    path: "~/MyNewAp1Claude",
    color: "#6b1f4a",
    initials: "M",
    sessions: [
      { id: "s1", title: "Setting up Ollama local server in Termux..." },
      { id: "s2", title: "How to Analyze Data Using Python: Secrets...", working: true },
      { id: "s3", title: "Responsive shell audit and redesign", unseen: true },
      { id: "s4", title: "Fix provider sync DB import error" },
      { id: "s5", title: "Add OmniRAG v4 implementation plan" },
    ],
  },
  {
    id: "p2",
    name: "omnirag",
    path: "~/omnirag",
    color: "#1a5f4a",
    initials: "O",
    sessions: [
      { id: "s6", title: "Deploy workflow with Cloudflare tunnel" },
      { id: "s7", title: "Config system and example pipelines" },
    ],
  },
  {
    id: "p3",
    name: "opencode-ui",
    path: "~/opencode-ui",
    color: "#3b2f80",
    initials: "U",
    sessions: [
      { id: "s8", title: "Shell wireframes and responsive model" },
    ],
  },
];

/* ─── Component ─── */
export default function OpenCodeHomePage() {
  const [activeProject, setActiveProject] = useState<string>("p1");
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [hoverProject, setHoverProject] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [lastPeekId, setLastPeekId] = useState<string | null>(null);
  const hoverTimeout = useRef<number | null>(null);

  const project = PROJECTS.find((p) => p.id === activeProject) || PROJECTS[0];
  const hovered = hoverProject ? PROJECTS.find((p) => p.id === hoverProject) : null;
  const lastPeek = lastPeekId ? PROJECTS.find((p) => p.id === lastPeekId) : null;

  // Track last peeked project so content persists during fade-out
  useEffect(() => {
    if (hovered) setLastPeekId(hovered.id);
  }, [hovered]);

  const armClose = useCallback(() => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    hoverTimeout.current = window.setTimeout(() => {
      setHoverProject(null);
      hoverTimeout.current = null;
    }, 300);
  }, []);

  const disarmClose = useCallback(() => {
    if (hoverTimeout.current) {
      clearTimeout(hoverTimeout.current);
      hoverTimeout.current = null;
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const selectProject = (id: string) => {
    setActiveProject(id);
    setSelectedSession(null);
    setHoverProject(null);
    setDrawerOpen(false);
  };

  const selectSession = (sid: string) => {
    setSelectedSession(sid);
    setDrawerOpen(false);
  };

  const newSession = () => {
    setSelectedSession(null);
    setDrawerOpen(false);
  };

  /* ─── Render helpers ─── */
  const ProjectAvatar = ({ p, size = 40, selected = false, onHover }: { p: Project; size?: number; selected?: boolean; onHover?: boolean }) => (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size > 40 ? 12 : 8,
        background: p.color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        border: selected ? "2px solid rgba(255,255,255,0.5)" : onHover ? "1px solid #2a2a2a" : "2px solid transparent",
        transition: "border-color 150ms, background-color 150ms",
        flexShrink: 0,
        position: "relative" as const,
      }}
    >
      <span style={{ fontSize: size > 40 ? 18 : 14, fontWeight: 600, color: "#fff", opacity: 0.9 }}>{p.initials}</span>
    </div>
  );

  const SessionRow = ({ s, dense }: { s: Session; dense?: boolean }) => (
    <div
      onClick={() => selectSession(s.id)}
      className="flex items-center gap-2 min-w-0 w-full cursor-pointer group"
      style={{
        padding: dense ? "4px 8px" : "6px 8px",
        borderRadius: 6,
        transition: "background 0.1s",
        background: selectedSession === s.id ? "rgba(255,255,255,0.06)" : undefined,
      }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.04)")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = selectedSession === s.id ? "rgba(255,255,255,0.06)" : "transparent")}
    >
      <span style={{ color: "#555", fontSize: 14, flexShrink: 0 }}>—</span>
      <span style={{ flex: 1, fontSize: 13, color: "#e8e8e8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {s.title}
      </span>
      <div className="flex items-center gap-1.5 shrink-0">
        {s.working && (
          <div style={{ width: 12, height: 12, border: "2px solid #2a2a2a", borderTopColor: "#888", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        )}
        {s.unseen && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#6366f1" }} />}
        {s.hasError && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444" }} />}
        <div className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "#444" }}>
          <Archive size={14} />
        </div>
      </div>
    </div>
  );

  const SidebarPanel = ({ p, isMobile }: { p: Project; isMobile?: boolean }) => (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        minWidth: 0,
        borderTopLeftRadius: 12,
        padding: "0 12px",
        borderLeft: "1px solid rgba(255,255,255,0.04)",
        borderTop: "1px solid rgba(255,255,255,0.04)",
        background: "#0d0d0d",
        flex: isMobile ? 1 : undefined,
        width: isMobile ? undefined : 260,
        overflow: "hidden",
      }}
    >
      {/* Project header */}
      <div style={{ padding: "12px 8px 4px", display: "flex", alignItems: "start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: "#e8e8e8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
          <div style={{ fontSize: 12, color: "#888", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.path}</div>
        </div>
        <div style={{ cursor: "pointer", color: "#555", flexShrink: 0, padding: 2 }}>
          <MoreHorizontal size={16} />
        </div>
      </div>

      {/* New session */}
      <div style={{ padding: "12px 0", flexShrink: 0 }}>
        <button
          onClick={newSession}
          style={{
            width: "100%",
            background: "#1e1e1e",
            border: "1px solid #2a2a2a",
            borderRadius: 8,
            padding: "10px 14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            color: "#e8e8e8",
            fontSize: 14,
            fontWeight: 500,
            cursor: "pointer",
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "#252525")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "#1e1e1e")}
        >
          <Edit3 size={14} />
          New session
        </button>
      </div>

      {/* Session list */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", scrollbarWidth: "none" as const }}>
        <div className="flex flex-col gap-0.5">
          {p.sessions.map((s) => (
            <SessionRow key={s.id} s={s} />
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div
      className="flex flex-col -mx-6 -mt-6 overflow-y-auto"
      style={{ height: "calc(100vh - 4rem)", background: "#111" }}
    >
      {/* ─── Live Preview ─── */}
      <div className="flex justify-center py-8 px-4 shrink-0">
        <div style={{ border: "2px solid #2a2a2a", borderRadius: 24, overflow: "hidden", boxShadow: "0 8px 40px rgba(0,0,0,0.5)" }}>
          <div
            className="flex flex-col overflow-hidden"
            style={{
              width: 430,
              height: 780,
              fontFamily: "-apple-system, 'SF Pro Text', 'Helvetica Neue', sans-serif",
              background: "#0d0d0d",
              color: "#e8e8e8",
            }}
          >
            {/* Status Bar */}
            <div className="flex justify-between items-center shrink-0" style={{ padding: "10px 16px 6px" }}>
              <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.3 }}>5:42</span>
              <div className="flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ opacity: 0.9 }}>
                  <line x1="1" y1="1" x2="23" y2="23" /><path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" />
                </svg>
                <svg width="16" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.9 }}>
                  <path d="M5 12.55a11 11 0 0114.08 0" /><circle cx="12" cy="20" r="1.5" />
                </svg>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.9 }}>
                  <rect x="1" y="15" width="4" height="9" rx="1" /><rect x="7" y="10" width="4" height="14" rx="1" /><rect x="13" y="5" width="4" height="19" rx="1" /><rect x="19" y="1" width="4" height="23" rx="1" opacity="0.35" />
                </svg>
                <span style={{ background: "#e8e8e8", borderRadius: 3, padding: "2px 5px", fontSize: 11, fontWeight: 700, color: "#000", minWidth: 24, textAlign: "center" as const }}>41</span>
              </div>
            </div>

            {/* Address Bar */}
            <div className="flex items-center gap-3 shrink-0" style={{ padding: "4px 12px 8px" }}>
              <Home size={20} style={{ color: "#777", flexShrink: 0 }} />
              <div className="flex-1 flex items-center gap-1.5" style={{ background: "#1e1e1e", border: "1px solid #2a2a2a", borderRadius: 20, padding: "6px 12px", fontSize: 13, color: "#777" }}>
                <span style={{ width: 14, height: 14, border: "1px solid #444", borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontStyle: "italic", fontFamily: "serif", color: "#444", flexShrink: 0 }}>i</span>
                <span>127.0.0.1:4096</span>
              </div>
              <div className="flex items-center gap-3.5" style={{ color: "#777" }}>
                <Plus size={18} />
                <span style={{ background: "#2e2e2e", border: "1px solid #444", borderRadius: 4, padding: "2px 6px", fontSize: 12, fontWeight: 600, color: "#e8e8e8" }}>2</span>
                <MoreVertical size={18} />
              </div>
            </div>

            {/* App Body — Sidebar + Main */}
            <div className="flex flex-1 overflow-hidden">
              {/* Sidebar Rail */}
              <div
                className="flex flex-col items-center shrink-0"
                style={{
                  width: 80,
                  background: "#0d0d0d",
                  borderRight: "1px solid #2a2a2a",
                  padding: "10px 0",
                }}
                onMouseEnter={disarmClose}
                onMouseLeave={() => { if (hoverProject) armClose(); }}
              >
                {/* Hamburger */}
                <div
                  onClick={() => setDrawerOpen(!drawerOpen)}
                  className="flex flex-col justify-center items-center gap-1 cursor-pointer shrink-0"
                  style={{ width: 44, height: 44, borderRadius: 8, background: "#1e1e1e", border: "1px solid #2a2a2a", marginBottom: 14 }}
                >
                  <span style={{ display: "block", width: 18, height: 2, background: "#777", borderRadius: 2 }} />
                  <span style={{ display: "block", width: 18, height: 2, background: "#777", borderRadius: 2 }} />
                  <span style={{ display: "block", width: 18, height: 2, background: "#777", borderRadius: 2 }} />
                </div>

                {/* Project Avatars */}
                {PROJECTS.map((p) => (
                  <div
                    key={p.id}
                    style={{ marginBottom: 14 }}
                    onClick={() => selectProject(p.id)}
                    onMouseEnter={() => { if (!sidebarExpanded) { disarmClose(); setHoverProject(p.id); } }}
                    onMouseLeave={() => { if (!sidebarExpanded) armClose(); }}
                  >
                    <ProjectAvatar
                      p={p}
                      size={52}
                      selected={activeProject === p.id}
                      onHover={hoverProject === p.id}
                    />
                  </div>
                ))}

                {/* Add */}
                <div className="flex items-center justify-center cursor-pointer" style={{ width: 36, height: 36, color: "#777", marginBottom: "auto" }}>
                  <Plus size={20} />
                </div>

                {/* Bottom icons */}
                <div className="flex flex-col items-center gap-4" style={{ paddingBottom: 8 }}>
                  <div className="flex items-center justify-center cursor-pointer" style={{ width: 32, height: 32, color: "#777" }}>
                    <Settings size={20} />
                  </div>
                  <div className="flex items-center justify-center cursor-pointer" style={{ width: 32, height: 32, color: "#777" }}>
                    <HelpCircle size={20} />
                  </div>
                </div>
              </div>

              {/* Main Panel */}
              <div className="flex flex-1 flex-col overflow-hidden" style={{ background: "#151515" }}>
                {/* Panel Header */}
                <div className="flex items-center justify-between shrink-0" style={{ padding: "14px 16px 10px", borderBottom: "1px solid #2a2a2a" }}>
                  <span style={{ fontSize: 15, color: "#777" }}>/</span>
                  <div className="flex items-center gap-2.5">
                    <div className="relative flex items-center justify-center" style={{ width: 30, height: 30, color: "#777" }}>
                      <Grid3X3 size={18} />
                      <div style={{ position: "absolute", top: 5, right: 5, width: 6, height: 6, background: "#4caf50", borderRadius: "50%" }} />
                    </div>
                    <div className="flex items-center justify-center" style={{ width: 30, height: 30, color: "#777" }}>
                      <Terminal size={18} />
                    </div>
                    <span style={{ fontSize: 18, color: "#777", letterSpacing: 1, cursor: "pointer", padding: 4 }}>···</span>
                  </div>
                </div>

                {/* Panel Content */}
                <div className="flex-1 overflow-y-auto" style={{ padding: "16px 12px", scrollbarWidth: "none" as const }}>
                  {!selectedSession ? (
                    <>
                      {/* New Session Button */}
                      <button
                        onClick={newSession}
                        className="w-full flex items-center justify-center gap-2.5 cursor-pointer"
                        style={{
                          background: "#222",
                          border: "1px solid #2a2a2a",
                          borderRadius: 8,
                          padding: "14px 16px",
                          color: "#e8e8e8",
                          fontSize: 15,
                          fontWeight: 500,
                          marginBottom: 10,
                          transition: "background 0.15s",
                        }}
                        onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "#2a2a2a")}
                        onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "#222")}
                      >
                        <Edit3 size={16} />
                        New session
                      </button>

                      {/* Session List */}
                      {project.sessions.map((s) => (
                        <div
                          key={s.id}
                          onClick={() => selectSession(s.id)}
                          className="w-full flex items-center gap-2.5 cursor-pointer"
                          style={{
                            background: "#1e1e1e",
                            border: "1px solid #2a2a2a",
                            borderRadius: 8,
                            padding: "13px 14px",
                            marginBottom: 8,
                            transition: "background 0.15s",
                          }}
                          onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.background = "#252525")}
                          onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = "#1e1e1e")}
                        >
                          <span style={{ color: "#777", fontSize: 16, flexShrink: 0 }}>—</span>
                          <span style={{ flex: 1, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.title}</span>
                          {s.working && (
                            <div style={{ width: 14, height: 14, border: "2px solid #2a2a2a", borderTopColor: "#888", borderRadius: "50%", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
                          )}
                          {s.unseen && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#6366f1", flexShrink: 0 }} />}
                          <div style={{ color: "#444", flexShrink: 0 }}>
                            <Archive size={16} />
                          </div>
                        </div>
                      ))}
                    </>
                  ) : (
                    /* Selected session placeholder */
                    <div className="flex flex-col items-center justify-center gap-3" style={{ paddingTop: 60, color: "#555" }}>
                      <ChevronRight size={32} style={{ opacity: 0.3 }} />
                      <span style={{ fontSize: 14 }}>Session view → chat interface</span>
                      <button
                        onClick={() => setSelectedSession(null)}
                        style={{ background: "#1e1e1e", border: "1px solid #2a2a2a", borderRadius: 8, padding: "8px 16px", color: "#e8e8e8", fontSize: 13, cursor: "pointer" }}
                      >
                        Back to sessions
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Peek Panel (hover overlay) — always rendered, transition in/out */}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 56,
                  left: 80,
                  zIndex: 30,
                  display: "flex",
                  opacity: hovered && !sidebarExpanded ? 1 : 0,
                  transform: hovered && !sidebarExpanded ? "translateX(0)" : "translateX(-8px)",
                  pointerEvents: hovered && !sidebarExpanded ? "auto" : "none",
                  transition: hovered && !sidebarExpanded
                    ? "opacity 180ms ease-out, transform 180ms ease-out"
                    : "opacity 120ms ease-in, transform 120ms ease-in",
                }}
                onMouseEnter={disarmClose}
                onMouseLeave={armClose}
              >
                <div style={{ width: 260, background: "#101318", border: "1px solid #2a2a2a", borderRadius: "0 0 12px 0", overflow: "hidden", boxShadow: "4px 0 24px rgba(0,0,0,0.4)" }}>
                  {(hovered || lastPeek) && <SidebarPanel p={(hovered || lastPeek)!} />}
                </div>
              </div>
            </div>

            {/* Mobile Drawer Overlay — always rendered, opacity transition */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                top: 56,
                zIndex: 40,
                background: "rgba(0,0,0,0.5)",
                opacity: drawerOpen ? 1 : 0,
                pointerEvents: drawerOpen ? "auto" : "none",
                transition: "opacity 200ms",
              }}
              onClick={() => setDrawerOpen(false)}
            />
            {/* Mobile Drawer Nav */}
            <div
              style={{
                position: "absolute",
                top: 56,
                bottom: 56,
                left: 0,
                zIndex: 50,
                width: "85%",
                maxWidth: 320,
                background: "#111",
                borderRight: "1px solid #2a2a2a",
                transform: drawerOpen ? "translateX(0)" : "translateX(-100%)",
                transition: "transform 200ms ease-out",
                display: "flex",
                overflow: "hidden",
              }}
            >
              {/* Drawer rail */}
              <div className="flex flex-col items-center shrink-0" style={{ width: 64, background: "#0d0d0d", padding: "12px 0", gap: 8 }}>
                {PROJECTS.map((p) => (
                  <div key={p.id} onClick={() => selectProject(p.id)} style={{ cursor: "pointer" }}>
                    <ProjectAvatar p={p} size={40} selected={activeProject === p.id} />
                  </div>
                ))}
                <div className="flex items-center justify-center" style={{ width: 32, height: 32, color: "#777", marginTop: 8 }}>
                  <Plus size={18} />
                </div>
                <div style={{ flex: 1 }} />
                <div className="flex items-center justify-center" style={{ width: 32, height: 32, color: "#777" }}>
                  <Settings size={18} />
                </div>
                <div className="flex items-center justify-center" style={{ width: 32, height: 32, color: "#777", marginBottom: 8 }}>
                  <HelpCircle size={18} />
                </div>
              </div>
              {/* Drawer panel */}
              <SidebarPanel p={project} isMobile />
            </div>

            {/* Nav Bar */}
            <div className="flex justify-around items-end shrink-0" style={{ padding: "8px 24px 16px", background: "#0d0d0d" }}>
              <div style={{ color: "#777", minWidth: 60, display: "flex", justifyContent: "center" }}><ArrowRight size={22} /></div>
              <div style={{ color: "#777", minWidth: 60, display: "flex", justifyContent: "center" }}><Square size={22} /></div>
              <div style={{ color: "#777", minWidth: 60, display: "flex", justifyContent: "center" }}><ArrowLeft size={22} /></div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            transition-duration: 0ms !important;
            animation-duration: 0ms !important;
          }
        }
      `}</style>

      {/* ─── Source Code ─── */}
      <div className="px-4 pb-12 mx-auto w-full" style={{ maxWidth: 900 }}>
        <div style={{ borderTop: "1px solid #2a2a2a", paddingTop: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e8e8e8", marginBottom: 4 }}>Source Code</h2>
          <p style={{ fontSize: 13, color: "#888", marginBottom: 16 }}>
            opencode-home.html — Home/project screen with sidebar rail, session list, hover-peek panel
          </p>

          <div style={{ background: "#0a0a0a", border: "1px solid #1e1e1e", borderRadius: 10, overflow: "hidden" }}>
            <div className="flex items-center justify-between" style={{ padding: "8px 14px", borderBottom: "1px solid #1e1e1e" }}>
              <div className="flex items-center gap-2">
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ff5f57" }} />
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#febc2e" }} />
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#28c840" }} />
              </div>
              <span style={{ fontSize: 11, color: "#555" }}>opencode-home.html</span>
              <div style={{ width: 44 }} />
            </div>
            <pre style={{
              margin: 0,
              padding: "16px 20px",
              fontSize: 12,
              lineHeight: 1.7,
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
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

const SOURCE_CODE = `<!-- OpenCode Home — Architecture Summary -->
<!--
  Source files (github.com/anthropics/opencode):
    pages/home.tsx          — landing page (logo, recent projects, open project)
    pages/layout.tsx        — shell root (titlebar + sidebar + main + peek)
    pages/layout/sidebar-shell.tsx    — rail (64px) + panel flex
    pages/layout/sidebar-project.tsx  — project tiles (SortableProject, HoverCard)
    pages/layout/sidebar-workspace.tsx — workspace sessions (LocalWorkspace, SortableWorkspace)
    pages/layout/sidebar-items.tsx    — ProjectIcon (Avatar), SessionItem, SessionRow
    context/layout.tsx      — persisted layout store (sidebar, terminal, review, fileTree, session)
-->

<!-- ═══ SHELL STRUCTURE ═══ -->

<div class="shell">                         <!-- flex-col, 100dvh -->
  <header class="titlebar">                 <!-- h-10, grid 3-col -->
    [hamburger lg:hidden]  [sidebar-toggle hidden lg:flex]  [nav-btns hidden md:flex]
  </header>

  <div class="shell-body">                  <!-- flex-1, flex-row -->
    <nav class="sidebar-nav hidden md:block" style="width: navWidth()">
      <!-- SidebarContent: rail + panel -->
      <div class="sidebar-rail" style="width: 64px">
        <!-- DragDropProvider + SortableProvider -->
        <For each={projects}>
          <SortableProject>
            <ProjectTile>               <!-- size-10, rounded-lg -->
              <ContextMenu.Trigger>
                <ProjectIcon>           <!-- Avatar 32px, colored bg -->
                  <notification-dot />  <!-- 6px: yellow/red/blue -->
                </ProjectIcon>
              </ContextMenu.Trigger>
              <!-- Click: selected → toggle sidebar, else → navigate -->
              <!-- Hover: overlay mode → aim system → peek panel -->
            </ProjectTile>
          </SortableProject>
        </For>
        <button>[+] Open project</button>
        <button>Settings</button>
        <button>Help</button>
      </div>

      <div class="sidebar-panel" style="width: panel()">
        <!-- SidebarPanel: project header + new session + session list -->
        <InlineEditor>{project.name}</InlineEditor>
        <span>{project.path}</span>
        <DropdownMenu>Edit | Workspaces | Clear | Close</DropdownMenu>

        <Button icon="new-session">New session</Button>

        <LocalWorkspace>
          <For each={sessions}>
            <SessionRow>
              <A href="/{slug}/session/{id}">
                — {session.title}
                <Spinner when={working} />
                <dot when={unseen} />
                <Archive on-hover />
              </A>
            </SessionRow>
          </For>
        </LocalWorkspace>
      </div>
    </nav>

    <!-- Mobile drawer (lg:hidden) -->
    <div class="drawer-overlay" />
    <nav class="drawer-nav" role="dialog" aria-modal="true">
      {sidebarContent(mobile=true)}    <!-- always expanded -->
    </nav>

    <!-- Peek panel (hidden lg:flex, mouse only) -->
    <div class="peek-panel"
         style="left: 64px; opacity/translate transition 180ms/120ms">
      <SidebarPanel project={hoverProject} merged={false} />
      <shadow-edge />
    </div>

    <!-- Main content -->
    <main style="left: var(--main-left)">   <!-- md: rail offset, lg: sidebar offset -->
      {children}                            <!-- home.tsx or session route -->
    </main>
  </div>
</div>

<!-- ═══ HOME PAGE (pages/home.tsx) ═══ -->

<div class="mx-auto mt-55 px-4">
  <Logo class="opacity-12" />
  <Button>{server.name} <status-dot /></Button>

  <!-- 3 states: has-projects | loading | empty -->
  <Switch>
    <Match when={projects.length > 0}>
      "Recent Projects" (top 5 sorted by time.updated)
      <For each={recent}>
        <Button onClick={openProject(dir)}>
          {dir.replace(home, "~")}    {relativeTime}
        </Button>
      </For>
    </Match>
    <Match when={!ready}>Loading... [Open project]</Match>
    <Match when={true}>Empty state + [Open project]</Match>
  </Switch>
</div>

<!-- ═══ TRANSITIONS (all implemented) ═══ -->

/* Peek panel — always rendered, never unmounted.
   Uses opacity + translateX toggle with separate in/out easings.
   lastPeekId keeps panel content during fade-out. */

peek-panel {
  opacity:        hovered ? 1 : 0;
  transform:      hovered ? translateX(0) : translateX(-8px);
  pointer-events: hovered ? auto : none;
  transition:     hovered
    ? "opacity 180ms ease-out, transform 180ms ease-out"   /* IN  */
    : "opacity 120ms ease-in,  transform 120ms ease-in";   /* OUT */
}

/* Mobile overlay — always rendered, opacity toggle */
drawer-overlay {
  opacity:        drawerOpen ? 1 : 0;
  pointer-events: drawerOpen ? auto : none;
  transition:     opacity 200ms;
}

/* Mobile drawer — always rendered, translateX toggle */
drawer-nav {
  transform:  drawerOpen ? translateX(0) : translateX(-100%);
  transition: transform 200ms ease-out;
}

/* Project tile border */
project-avatar {
  transition: border-color 150ms, background-color 150ms;
}

/* Session item hover */
session-row {
  transition: background 100ms;
}

/* New session / session card hover */
button, .session-item {
  transition: background 150ms;
}

/* Archive button — Tailwind group-hover reveal */
.archive { @apply opacity-0 group-hover:opacity-100 transition-opacity; }

/* Spinner */
@keyframes spin { to { transform: rotate(360deg); } }
.spinner { animation: spin 800ms linear infinite; }

/* Reduced motion — kills all transitions + animations */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    transition-duration: 0ms !important;
    animation-duration: 0ms !important;
  }
}

/* Full transition table:
   Element              | Duration | Easing                          | Property
   ─────────────────────┼──────────┼─────────────────────────────────┼─────────────────
   Sidebar open/close   | 200ms    | cubic-bezier(0.22,1,0.36,1)    | left
   Peek panel IN        | 180ms    | ease-out                        | opacity, transform
   Peek panel OUT       | 120ms    | ease-in                         | opacity, transform
   Mobile drawer        | 200ms    | ease-out                        | transform
   Mobile overlay       | 200ms    | linear                          | opacity
   Project tile         | 150ms    | linear                          | border-color, bg
   Session row hover    | 100ms    | linear                          | background
   Button hover         | 150ms    | linear                          | background
   Archive reveal       | default  | Tailwind                        | opacity
   Spinner              | 800ms    | linear infinite                 | rotate
   Session side panel   | 240ms    | cubic-bezier(0.22,1,0.36,1)    | width
   HoverCard            | 0ms      | instant                         | openDelay/closeDelay
   Resize               | 0ms      | disabled during state.sizing    | —
   reduced-motion       | 0ms      | forced                          | all
*/

<!-- ═══ HOVER-PEEK SYSTEM ═══ -->

/* Key insight: peek panel is NEVER unmounted.
   It stays in DOM with opacity:0 + pointer-events:none.
   This allows CSS out-transition to play (120ms ease-in).
   lastPeekId remembers which project was peeked so content
   persists during fade-out instead of going blank. */

createAim({
  enabled: () => !sidebar.opened() && !isTouch(),
  onActivate: (dir) => {
    setHoverProject(dir)       // triggers peek IN  (180ms)
  }
})

arm():    300ms timeout → setHoverProject(null)  // triggers peek OUT (120ms)
disarm(): clearTimeout                            // cancels close

mouseEnter nav       → disarm()
mouseLeave nav       → arm()
peek panel mouseEnter → disarm()
peek panel mouseLeave → arm()

<!-- ═══ PERSISTED STATE (context/layout.tsx) ═══ -->

store = {
  sidebar:       { opened, width: 344, workspaces }
  terminal:      { height: 280, opened }
  review:        { diffStyle: "split", panelOpened: true }
  fileTree:      { opened, width: 200, tab: "changes" }
  session:       { width: 600 }
  mobileSidebar: { opened }
  sessionTabs:   Record<key, { active, all[] }>
  sessionView:   Record<key, { scroll, reviewOpen, pendingMessage }>
}`;
