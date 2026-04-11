/**
 * KGRA Agent — embedded inside the app shell via iframe.
 * The actual UI is served from /kgra-ui (cloned OmniRAG interface).
 * This page wraps it inside MainLayout so it stays within the app navigation.
 */
export default function KGRAAgentPage() {
  return (
    <div className="-mx-6 -mt-6 overflow-hidden" style={{ height: "calc(100vh - 4rem)" }}>
      <iframe
        src="/kgra-ui"
        title="KGRA Agent"
        className="w-full h-full border-0"
        allow="clipboard-write"
      />
    </div>
  );
}
