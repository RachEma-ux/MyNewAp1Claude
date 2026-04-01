/**
 * AI Types Shell — Simple IBM Shell wrapper
 *
 * Renders sidebar + content in a flex layout.
 * Routes handled internally via wouter path match.
 * Pattern: flex -mx-6 -mt-6 overflow-hidden, height: calc(100vh - 4rem)
 */
import { useState, lazy, Suspense } from "react";
import { useRoute, useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import AITypesSidebar from "@/components/ai-types/AITypesSidebar";

const AITypesOverviewPage = lazy(() => import("./AITypesOverviewPage"));
const AITypesCatalogPage = lazy(() => import("../AITypesPage"));
const AITypesTaxonomyPage = lazy(() => import("./AITypesTaxonomyPage"));
const AITypesRelationshipsPage = lazy(() => import("./AITypesRelationshipsPage"));
const AITypesValidationPage = lazy(() => import("./AITypesValidationPage"));
const AITypesGovernancePage = lazy(() => import("./AITypesGovernancePage"));
const AITypesControlPanelPage = lazy(() => import("./AITypesControlPanelPage"));

/** Map sidebar key to route suffix */
const sidebarToRoute: Record<string, string> = {
  overview: "/ai-types/overview",
  catalog: "/ai-types/catalog",
  taxonomy: "/ai-types/taxonomy",
  relationships: "/ai-types/relationships",
  validation: "/ai-types/validation",
  governance: "/ai-types/governance",
  "control-panel": "/ai-types/control-panel",
};

/** Derive active sidebar key from current path */
function getActiveKey(path: string): string {
  if (path.startsWith("/ai-types/catalog") || path.startsWith("/ai-types/providers") || path.startsWith("/ai-types/llms") || path.startsWith("/ai-types/models") || path.startsWith("/ai-types/agents") || path.startsWith("/ai-types/bots")) return "catalog";
  if (path.startsWith("/ai-types/taxonomy")) return "taxonomy";
  if (path.startsWith("/ai-types/relationships")) return "relationships";
  if (path.startsWith("/ai-types/validation")) return "validation";
  if (path.startsWith("/ai-types/governance")) return "governance";
  if (path.startsWith("/ai-types/control-panel")) return "control-panel";
  if (path.startsWith("/ai-types/overview")) return "overview";
  return "overview"; // /ai-types bare path also defaults to overview
}

const Fallback = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
  </div>
);

export default function AITypesShell() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [location, navigate] = useLocation();
  const activeKey = getActiveKey(location);

  // Route matchers
  const [isOverview] = useRoute("/ai-types/overview");
  const [isTaxonomy] = useRoute("/ai-types/taxonomy");
  const [isRelationships] = useRoute("/ai-types/relationships");
  const [isValidation] = useRoute("/ai-types/validation");
  const [isGovernance] = useRoute("/ai-types/governance");
  const [isControlPanel] = useRoute("/ai-types/control-panel");
  const [isCatalogType] = useRoute("/ai-types/:type");

  const handleNavigate = (key: string) => {
    const route = sidebarToRoute[key];
    if (route) navigate(route);
  };

  let content: React.ReactNode;
  if (isOverview) {
    content = <AITypesOverviewPage />;
  } else if (isTaxonomy) {
    content = <AITypesTaxonomyPage />;
  } else if (isRelationships) {
    content = <AITypesRelationshipsPage />;
  } else if (isValidation) {
    content = <AITypesValidationPage />;
  } else if (isGovernance) {
    content = <AITypesGovernancePage />;
  } else if (isControlPanel) {
    content = <AITypesControlPanelPage />;
  } else if (isCatalogType) {
    content = <AITypesCatalogPage />;
  } else {
    content = <AITypesOverviewPage />;
  }

  return (
    <div
      className="flex -mx-6 -mt-6 overflow-hidden"
      style={{ height: "calc(100vh - 4rem)" }}
    >
      <AITypesSidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        active={activeKey}
        onNavigate={handleNavigate}
      />
      <div className="flex-1 min-w-0 overflow-y-auto">
        <Suspense fallback={<Fallback />}>
          {content}
        </Suspense>
      </div>
    </div>
  );
}
