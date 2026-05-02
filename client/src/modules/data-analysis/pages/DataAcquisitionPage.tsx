/**
 * Data Acquisition — Main Shell Page (Data Analysis subdomain)
 *
 * Top-level shell for /data-analysis/data-acquisition. Tabs cover
 * the universal acquisition lifecycle: Sources → Runs → Items →
 * Classification → Routing → Processing → Document Intelligence →
 * Canonical Records → Outputs → Settings. Each tab renders a
 * minimal-but-functional view backed by the
 * `dataAnalysis.dataAcquisition.*` tRPC surface.
 *
 * The Document Intelligence tab is intentionally one tab among
 * many — it is one specialized pipeline inside Data Acquisition,
 * not the whole subdomain.
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Database,
  PlayCircle,
  ListTree,
  Tags,
  Route as RouteIcon,
  Cpu,
  FileText,
  Layers,
  Send,
  Settings as SettingsIcon,
  LayoutDashboard,
} from "lucide-react";

import { DataAcquisitionWorkerBanner } from "./DataAcquisitionWorkerBanner";
import { DataAcquisitionSummaryCards } from "./DataAcquisitionSummaryCards";

const TABS: Array<{
  value: string;
  label: string;
  icon: any;
}> = [
  { value: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { value: "sources", label: "Sources", icon: Database },
  { value: "runs", label: "Runs", icon: PlayCircle },
  { value: "items", label: "Items", icon: ListTree },
  { value: "classification", label: "Classification", icon: Tags },
  { value: "routing", label: "Routing", icon: RouteIcon },
  { value: "processing", label: "Processing", icon: Cpu },
  { value: "document", label: "Document Intelligence", icon: FileText },
  { value: "canonical", label: "Canonical", icon: Layers },
  { value: "outputs", label: "Outputs", icon: Send },
  { value: "settings", label: "Settings", icon: SettingsIcon },
];

const PATH_TAB_MAP: Record<string, string> = {
  "/data-analysis/data-acquisition": "dashboard",
  "/data-analysis/data-acquisition/sources": "sources",
  "/data-analysis/data-acquisition/runs": "runs",
  "/data-analysis/data-acquisition/items": "items",
  "/data-analysis/data-acquisition/classification": "classification",
  "/data-analysis/data-acquisition/routing": "routing",
  "/data-analysis/data-acquisition/processing": "processing",
  "/data-analysis/data-acquisition/document-intelligence": "document",
  "/data-analysis/data-acquisition/canonical-records": "canonical",
  "/data-analysis/data-acquisition/outputs": "outputs",
  "/data-analysis/data-acquisition/settings": "settings",
};

export default function DataAcquisitionPage() {
  const [location] = useLocation();
  const initial = PATH_TAB_MAP[location] ?? "dashboard";
  const [tab, setTab] = useState(initial);

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Data Acquisition
          </h1>
          <p className="text-muted-foreground mt-1 max-w-3xl">
            Universal, governed, source-agnostic acquisition layer inside Data
            Analysis. Documents, sensors, streams, APIs, databases, SaaS, web,
            Git, manual forms, and webhooks flow through one core into
            specialized processing pipelines, then RAG / GraphRAG / analytics /
            warehouse / alerts / reports.
          </p>
        </div>
        <Badge variant="outline">subdomain of dataAnalysis</Badge>
      </div>

      <DataAcquisitionWorkerBanner />

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="flex flex-wrap gap-1 h-auto">
          {TABS.map(({ value, label, icon: Icon }) => (
            <TabsTrigger key={value} value={value} className="gap-2">
              <Icon className="h-4 w-4" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4">
          <DataAcquisitionSummaryCards />
        </TabsContent>

        <TabsContent value="sources">
          <SourcesPanel />
        </TabsContent>

        <TabsContent value="runs">
          <RunsPanel />
        </TabsContent>

        <TabsContent value="items">
          <ItemsPanel />
        </TabsContent>

        <TabsContent value="classification">
          <ClassificationPanel />
        </TabsContent>

        <TabsContent value="routing">
          <RoutingPanel />
        </TabsContent>

        <TabsContent value="processing">
          <ProcessingPanel />
        </TabsContent>

        <TabsContent value="document">
          <DocumentPanel />
        </TabsContent>

        <TabsContent value="canonical">
          <CanonicalPanel />
        </TabsContent>

        <TabsContent value="outputs">
          <OutputsPanel />
        </TabsContent>

        <TabsContent value="settings">
          <SettingsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ── Panels ────────────────────────────────────────────────────────── */

function SourcesPanel() {
  const sources = trpc.dataAnalysis.dataAcquisition.listSources.useQuery({});
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sources</CardTitle>
      </CardHeader>
      <CardContent>
        {sources.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : sources.data && sources.data.length > 0 ? (
          <div className="space-y-2">
            {sources.data.map((src: any) => (
              <div
                key={src.id}
                className="flex items-center justify-between border rounded p-3"
              >
                <div>
                  <p className="font-medium">{src.displayName}</p>
                  <p className="text-xs text-muted-foreground">
                    {src.sourceType} · {src.sourceUri}
                  </p>
                </div>
                <Badge variant={src.status === "active" ? "default" : "secondary"}>
                  {src.status}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState message="No sources registered yet. Use the public-API or workspace UI to register one." />
        )}
      </CardContent>
    </Card>
  );
}

function RunsPanel() {
  const runs = trpc.dataAnalysis.dataAcquisition.listRuns.useQuery({});
  return (
    <Card>
      <CardHeader>
        <CardTitle>Acquisition Runs</CardTitle>
      </CardHeader>
      <CardContent>
        {runs.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : runs.data && runs.data.length > 0 ? (
          <RunsTable rows={runs.data} />
        ) : (
          <EmptyState message="No runs yet." />
        )}
      </CardContent>
    </Card>
  );
}

function ItemsPanel() {
  const items = trpc.dataAnalysis.dataAcquisition.listItems.useQuery({});
  return (
    <Card>
      <CardHeader>
        <CardTitle>Discovered Items</CardTitle>
      </CardHeader>
      <CardContent>
        {items.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : items.data && items.data.length > 0 ? (
          <ItemsTable rows={items.data} />
        ) : (
          <EmptyState message="No items discovered." />
        )}
      </CardContent>
    </Card>
  );
}

function ClassificationPanel() {
  const classifications =
    trpc.dataAnalysis.dataAcquisition.listClassifications.useQuery({});
  return (
    <Card>
      <CardHeader>
        <CardTitle>Classifications</CardTitle>
      </CardHeader>
      <CardContent>
        {classifications.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : classifications.data && classifications.data.length > 0 ? (
          <pre className="text-xs overflow-x-auto">
            {JSON.stringify(classifications.data, null, 2)}
          </pre>
        ) : (
          <EmptyState message="No classifications yet — call classifyItem on an item." />
        )}
      </CardContent>
    </Card>
  );
}

function RoutingPanel() {
  const routes = trpc.dataAnalysis.dataAcquisition.listRoutes.useQuery({});
  return (
    <Card>
      <CardHeader>
        <CardTitle>Routing Decisions</CardTitle>
      </CardHeader>
      <CardContent>
        {routes.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : routes.data && routes.data.length > 0 ? (
          <pre className="text-xs overflow-x-auto">
            {JSON.stringify(routes.data, null, 2)}
          </pre>
        ) : (
          <EmptyState message="No routing decisions yet — call routeItem after classification." />
        )}
      </CardContent>
    </Card>
  );
}

function ProcessingPanel() {
  const runs = trpc.dataAnalysis.dataAcquisition.listProcessingRuns.useQuery({});
  return (
    <Card>
      <CardHeader>
        <CardTitle>Processing Runs</CardTitle>
      </CardHeader>
      <CardContent>
        {runs.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : runs.data && runs.data.length > 0 ? (
          <pre className="text-xs overflow-x-auto">
            {JSON.stringify(runs.data, null, 2)}
          </pre>
        ) : (
          <EmptyState message="No processing runs yet. Worker-bound runs are recorded as failed/degraded when the worker is offline — they are never silently dropped." />
        )}
      </CardContent>
    </Card>
  );
}

function DocumentPanel() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Document Intelligence</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Document Intelligence is one specialized pipeline inside Data
          Acquisition. The classifier picks complexity (simple / structured /
          scan / complex), the router picks a parser (markitdown / docling /
          llamaparse / unstructured / tesseract / paddleocr) plus a fallback
          chain, and the worker performs the parse. Validation writes a
          canonical document record.
        </p>
        <p className="text-xs text-muted-foreground">
          The Data Acquisition worker (`http://localhost:8485`) is required
          for parse / OCR / reconstruct / validate happy-path. Missing worker
          ⇒ degraded.
        </p>
      </CardContent>
    </Card>
  );
}

function CanonicalPanel() {
  const records =
    trpc.dataAnalysis.dataAcquisition.listCanonicalRecords.useQuery({});
  return (
    <Card>
      <CardHeader>
        <CardTitle>Canonical Records</CardTitle>
      </CardHeader>
      <CardContent>
        {records.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : records.data && records.data.length > 0 ? (
          <pre className="text-xs overflow-x-auto">
            {JSON.stringify(records.data, null, 2)}
          </pre>
        ) : (
          <EmptyState message="No canonical records yet — they are written by the worker after validation." />
        )}
      </CardContent>
    </Card>
  );
}

function OutputsPanel() {
  const runs = trpc.dataAnalysis.dataAcquisition.listOutputRuns.useQuery({});
  return (
    <Card>
      <CardHeader>
        <CardTitle>Output Pipelines</CardTitle>
      </CardHeader>
      <CardContent>
        {runs.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : runs.data && runs.data.length > 0 ? (
          <pre className="text-xs overflow-x-auto">
            {JSON.stringify(runs.data, null, 2)}
          </pre>
        ) : (
          <EmptyState message="No output runs yet — runOutputPipeline records one per emission to rag/graphrag/analytics/warehouse/alerts/reports/markdown/html/pdf." />
        )}
      </CardContent>
    </Card>
  );
}

function SettingsPanel() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p>
          <strong>Worker URL env var:</strong>{" "}
          <code>DATA_ACQUISITION_WORKER_URL</code> (default{" "}
          <code>http://localhost:8485</code>)
        </p>
        <p>
          <strong>DB:</strong> Phase-1 staged — Data Acquisition tables live in
          the shared platform DB; Data Analysis is the canonical declared
          owner. The Phase-2 move to <code>dataanalysisdb</code> is one-line in{" "}
          <code>server/data-analysis/connection.ts</code>.
        </p>
        <p>
          <strong>Coordinator:</strong> not used for ordinary Data Acquisition
          actions. Cross-module workflows (e.g. canonical record →
          GraphRAG ingest) flow over events, not coordinator calls.
        </p>
      </CardContent>
    </Card>
  );
}

/* ── Helpers ───────────────────────────────────────────────────────── */

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-sm text-muted-foreground py-8 text-center">
      {message}
    </div>
  );
}

function RunsTable({ rows }: { rows: any[] }) {
  return (
    <div className="space-y-1">
      {rows.map((r) => (
        <div key={r.id} className="flex items-center justify-between border rounded p-2 text-sm">
          <span>#{r.id} · src={r.sourceId} · {r.runType}</span>
          <Badge variant={r.status === "completed" ? "default" : "secondary"}>{r.status}</Badge>
        </div>
      ))}
    </div>
  );
}

function ItemsTable({ rows }: { rows: any[] }) {
  return (
    <div className="space-y-1">
      {rows.map((r) => (
        <div key={r.id} className="flex items-center justify-between border rounded p-2 text-sm">
          <span>#{r.id} · {r.itemType} · {r.sourceUri}</span>
          <Badge variant={r.status === "processed" ? "default" : "secondary"}>{r.status}</Badge>
        </div>
      ))}
    </div>
  );
}
