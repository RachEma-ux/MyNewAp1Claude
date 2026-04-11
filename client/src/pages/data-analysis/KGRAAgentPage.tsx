/**
 * KGRA Agent — loads the OmniRAG-cloned UI directly into the page.
 * No iframe. Fetches HTML body from /kgra-ui, injects CSS + JS.
 */
import { useEffect, useRef } from "react";

export default function KGRAAgentPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current || !containerRef.current) return;
    loaded.current = true;

    const container = containerRef.current;

    // Load CSS
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/kgra-ui/styles.css";
    document.head.appendChild(link);

    // Load HTML body
    fetch("/kgra-ui")
      .then((r) => r.text())
      .then((html) => {
        const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
        container.innerHTML = bodyMatch ? bodyMatch[1] : html;

        // Remove inline script tags (we load app.js separately to avoid duplication)
        container.querySelectorAll("script").forEach((s) => s.remove());

        // Load all KGRA scripts in order: core → subsystems → app → designer
        const scripts = [
          "/kgra-ui/graph-state.js",
          "/kgra-ui/graph-animation.js",
          "/kgra-ui/graph-camera.js",
          "/kgra-ui/graph-api.js",
          "/kgra-ui/graph-renderer.js",
          "/kgra-ui/graph-layout.js",
          "/kgra-ui/graph-filters.js",
          "/kgra-ui/graph-interaction.js",
          "/kgra-ui/graph-inspector.js",
          "/kgra-ui/graph-workbench.js",
          "/kgra-ui/app.js",
          "/kgra-ui/designer.js",
        ];
        for (const src of scripts) {
          const old = document.querySelector(`script[src="${src}"]`);
          if (old) old.remove();
          const s = document.createElement("script");
          s.src = src;
          document.body.appendChild(s);
        }
      })
      .catch((err) => {
        container.innerHTML = `<div style="padding:2rem;color:#f87171;">Failed to load KGRA Agent UI: ${err.message}</div>`;
      });

    return () => {
      link.remove();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="-mx-6 -mt-6 overflow-auto"
      style={{ height: "calc(100vh - 4rem)" }}
    />
  );
}
