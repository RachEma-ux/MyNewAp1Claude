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

        // Remove any script tags from the HTML (we'll load app.js separately)
        container.querySelectorAll("script").forEach((s) => s.remove());

        // Load app.js
        const script = document.createElement("script");
        script.src = "/kgra-ui/app.js";
        script.async = true;
        document.body.appendChild(script);
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
