/**
 * GraphRAG — Main Shell Page
 *
 * Top-level page for Data Analysis > GraphRAG.
 * Renders a tab-based navigation across all GraphRAG sub-sections.
 */

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LayoutDashboard,
  Database,
  Plug,
  RefreshCw,
  Layers,
  FlaskConical,
  GitFork,
  FileText,
  Settings,
} from "lucide-react";
import { GraphRAGOverview } from "./GraphRAGOverview";
import { GraphRAGDatasets } from "./GraphRAGDatasets";
import { GraphRAGSourceAdapters } from "./GraphRAGSourceAdapters";
import { GraphRAGSyncRuns } from "./GraphRAGSyncRuns";
import { GraphRAGIndexRuns } from "./GraphRAGIndexRuns";
import { GraphRAGQueryLab } from "./GraphRAGQueryLab";
import { GraphRAGGraphExplorer } from "./GraphRAGGraphExplorer";
import { GraphRAGCommunityReports } from "./GraphRAGCommunityReports";
import { GraphRAGSettings } from "./GraphRAGSettings";

const tabs = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "datasets", label: "Datasets", icon: Database },
  { id: "adapters", label: "Source Adapters", icon: Plug },
  { id: "sync-runs", label: "Sync Runs", icon: RefreshCw },
  { id: "index-runs", label: "Index Runs", icon: Layers },
  { id: "query-lab", label: "Query Lab", icon: FlaskConical },
  { id: "graph-explorer", label: "Graph Explorer", icon: GitFork },
  { id: "community-reports", label: "Community Reports", icon: FileText },
  { id: "settings", label: "Settings", icon: Settings },
] as const;

export default function GraphRAGPage() {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">GraphRAG</h1>
        <p className="text-muted-foreground mt-1">
          Knowledge graph-powered retrieval augmented generation engine
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap gap-1 h-auto p-1">
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="flex items-center gap-1.5 text-xs"
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview">
          <GraphRAGOverview />
        </TabsContent>
        <TabsContent value="datasets">
          <GraphRAGDatasets />
        </TabsContent>
        <TabsContent value="adapters">
          <GraphRAGSourceAdapters />
        </TabsContent>
        <TabsContent value="sync-runs">
          <GraphRAGSyncRuns />
        </TabsContent>
        <TabsContent value="index-runs">
          <GraphRAGIndexRuns />
        </TabsContent>
        <TabsContent value="query-lab">
          <GraphRAGQueryLab />
        </TabsContent>
        <TabsContent value="graph-explorer">
          <GraphRAGGraphExplorer />
        </TabsContent>
        <TabsContent value="community-reports">
          <GraphRAGCommunityReports />
        </TabsContent>
        <TabsContent value="settings">
          <GraphRAGSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}
