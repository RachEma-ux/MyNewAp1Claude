/**
 * Data Warehouse — IBM Carbon Shell
 *
 * Data Analysis > Data Warehouse
 * Collapsible sidebar, full-height panels, status bar.
 * All data is live from the `datawarehouse` PostgreSQL database via tRPC.
 */

import { useState } from "react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Database,
  Layers,
  Building2,
  FileText,
  ShieldCheck,
  Link2,
  Code2,
  Search,
  Filter,
  X,
  Loader2,
  Sprout,
} from "lucide-react";

// ── Sidebar nav items ──

const NAV_ITEMS = [
  { key: "overview", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" /> },
  { key: "explorer", label: "Explorer", icon: <Search className="h-4 w-4" /> },
  { key: "sectors", label: "Sectors", icon: <Building2 className="h-4 w-4" /> },
  { key: "industries", label: "Industries", icon: <Layers className="h-4 w-4" /> },
  { key: "scopes", label: "Scopes", icon: <FileText className="h-4 w-4" /> },
  { key: "standards", label: "Standards", icon: <ShieldCheck className="h-4 w-4" /> },
  { key: "mappings", label: "Mappings", icon: <Link2 className="h-4 w-4" /> },
  { key: "schema", label: "Schema", icon: <Code2 className="h-4 w-4" /> },
] as const;

type NavKey = (typeof NAV_ITEMS)[number]["key"];

// ── Sidebar ──

function ShellSidebar({ active, onSelect, collapsed, onToggle }: {
  active: NavKey;
  onSelect: (key: NavKey) => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <aside className={cn(
      "flex flex-col border-r bg-card/50 transition-all duration-200 shrink-0",
      collapsed ? "w-12" : "w-56"
    )}>
      <div className="flex items-center gap-2 border-b px-3 h-12">
        {!collapsed && (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Database className="h-4 w-4 shrink-0 text-emerald-400" />
            <span className="text-sm font-semibold truncate">Data Warehouse</span>
          </div>
        )}
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onToggle}>
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>
      <nav className="flex-1 overflow-y-auto py-2 space-y-0.5 px-1.5">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            onClick={() => onSelect(item.key)}
            className={cn(
              "flex items-center gap-2 w-full px-3 py-1.5 text-sm rounded-md transition-colors",
              active === item.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              collapsed && "justify-center px-0"
            )}
          >
            {item.icon}
            {!collapsed && <span className="truncate">{item.label}</span>}
          </button>
        ))}
      </nav>
      <div className="border-t px-3 py-2">
        <Link href="/data-analysis/graphrag">
          <button className={cn(
            "flex items-center gap-2 w-full px-3 py-1.5 text-sm rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors",
            collapsed && "justify-center px-0"
          )}>
            <ChevronLeft className="h-4 w-4" />
            {!collapsed && <span>Back to GraphRAG</span>}
          </button>
        </Link>
      </div>
    </aside>
  );
}

// ── Status bar ──

function ShellStatusBar() {
  const { data: stats } = trpc.dataAnalysis.dataWarehouse.stats.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const totalRows = stats
    ? stats.sectors + stats.industries + stats.scopes + stats.standards + stats.mappings
    : 0;

  return (
    <div className="flex items-center justify-between border-t bg-card/50 px-4 h-7 text-xs text-muted-foreground shrink-0">
      <div className="flex items-center gap-4">
        <span className="font-mono text-emerald-400">Data Warehouse</span>
        <span>ISO PM / NAICS 2022</span>
      </div>
      <div className="flex items-center gap-3">
        <span>5 tables</span>
        <span>{totalRows > 0 ? `${totalRows.toLocaleString()} rows` : "no data"}</span>
        <div className="flex items-center gap-1">
          <div className={cn("h-1.5 w-1.5 rounded-full", totalRows > 0 ? "bg-green-500" : "bg-yellow-500")} />
          <span>{totalRows > 0 ? "3NF" : "empty"}</span>
        </div>
      </div>
    </div>
  );
}

// ── Loading / Empty states ──

function LoadingState({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span>{label || "Loading..."}</span>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <Card>
      <CardContent className="py-12 text-center text-muted-foreground">
        {label}
      </CardContent>
    </Card>
  );
}

function ErrorState({ error }: { error: string }) {
  return (
    <Card>
      <CardContent className="py-8 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <p className="text-xs text-muted-foreground mt-2">
          Make sure the <code className="bg-muted px-1 rounded">datawarehouse</code> database exists and has been seeded.
        </p>
      </CardContent>
    </Card>
  );
}

// ════════════════════════════════════════════════════════════════════
// Panel: Overview
// ════════════════════════════════════════════════════════════════════

function OverviewPanel() {
  const utils = trpc.useUtils();
  const { data: stats, isLoading, error } = trpc.dataAnalysis.dataWarehouse.stats.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const seedMutation = trpc.dataAnalysis.dataWarehouse.seed.useMutation({
    onSuccess: () => {
      utils.dataAnalysis.dataWarehouse.invalidate();
    },
  });

  const hasData = stats && (stats.sectors > 0 || stats.industries > 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Data Warehouse Overview</h1>
        <Button
          variant={hasData ? "outline" : "default"}
          size="sm"
          onClick={() => seedMutation.mutate()}
          disabled={seedMutation.isPending}
        >
          {seedMutation.isPending ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Seeding...</>
          ) : (
            <><Sprout className="h-4 w-4 mr-2" /> {hasData ? "Re-Seed Database" : "Seed Database"}</>
          )}
        </Button>
      </div>

      {seedMutation.isSuccess && (
        <Card className="border-green-500/30 bg-green-500/5">
          <CardContent className="py-3">
            <p className="text-sm text-green-600 dark:text-green-400">
              Database seeded successfully: {seedMutation.data.counts.sectors} sectors,{" "}
              {seedMutation.data.counts.industries} industries,{" "}
              {seedMutation.data.counts.scopes} scopes,{" "}
              {seedMutation.data.counts.standards} standards,{" "}
              {seedMutation.data.counts.mappings} mappings.
            </p>
          </CardContent>
        </Card>
      )}
      {seedMutation.isError && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="py-3">
            <p className="text-sm text-destructive">{seedMutation.error.message}</p>
          </CardContent>
        </Card>
      )}

      <p className="text-muted-foreground">
        Normalized relational model for ISO PM standards mapped to NAICS 2022 industries.
        Use the sidebar to explore each entity table and the schema.
      </p>

      {isLoading ? <LoadingState label="Loading stats..." /> : error ? (
        <ErrorState error={error.message} />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="overflow-hidden">
              <CardContent className="pt-4">
                <p className="text-xs font-medium text-muted-foreground">Sectors</p>
                <p className="text-3xl font-bold text-emerald-500">{stats?.sectors ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1 truncate">NAICS top-level sector,</p>
                <p className="text-xs text-muted-foreground truncate">codes and titles</p>
              </CardContent>
            </Card>
            <Card className="overflow-hidden">
              <CardContent className="pt-4">
                <p className="text-xs font-medium text-muted-foreground">Industries</p>
                <p className="text-3xl font-bold text-blue-500">{stats?.industries ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1 truncate">Unique NAICS 6-digit</p>
                <p className="text-xs text-muted-foreground truncate">industry codes</p>
              </CardContent>
            </Card>
            <Card className="overflow-hidden">
              <CardContent className="pt-4">
                <p className="text-xs font-medium text-muted-foreground">Scopes</p>
                <p className="text-3xl font-bold text-purple-500">{stats?.scopes ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1 truncate">Sector-specific PM</p>
                <p className="text-xs text-muted-foreground truncate">scope areas</p>
              </CardContent>
            </Card>
            <Card className="overflow-hidden">
              <CardContent className="pt-4">
                <p className="text-xs font-medium text-muted-foreground">Standards</p>
                <p className="text-3xl font-bold text-amber-500">{stats?.standards ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1 truncate">PM/ISO/governance</p>
                <p className="text-xs text-muted-foreground truncate">standards</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Data Model Summary</CardTitle>
              <CardDescription>
                {stats ? `${(stats.mappings).toLocaleString()} cross-reference mappings normalized into 5 relational tables` : "No data loaded"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { table: "dw_sectors", rows: stats?.sectors ?? 0, desc: "NAICS top-level sector codes and titles", color: "text-emerald-500 border-emerald-500/30" },
                  { table: "dw_industries", rows: stats?.industries ?? 0, desc: "NAICS 6-digit codes, each belonging to one sector", color: "text-blue-500 border-blue-500/30" },
                  { table: "dw_scopes", rows: stats?.scopes ?? 0, desc: "PM scope areas, keyed by (sector_code, scope_id)", color: "text-purple-500 border-purple-500/30" },
                  { table: "dw_standards", rows: stats?.standards ?? 0, desc: "PM/ISO/governance standards with issuing bodies", color: "text-amber-500 border-amber-500/30" },
                  { table: "dw_industry_scope_standards", rows: stats?.mappings ?? 0, desc: "Junction table mapping industries x scopes x standards", color: "text-rose-500 border-rose-500/30" },
                ].map((t) => (
                  <div key={t.table} className="flex flex-wrap items-start gap-2 min-w-0">
                    <Badge variant="outline" className={`shrink-0 font-mono text-xs ${t.color}`}>{t.table}</Badge>
                    <Badge variant="secondary" className="shrink-0 text-xs">{t.rows.toLocaleString()}</Badge>
                    <span className="text-sm text-muted-foreground break-words min-w-0">{t.desc}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {NAV_ITEMS.filter((i) => i.key !== "overview").map((item) => (
          <Card key={item.key} className="hover:border-primary/50 transition-colors cursor-pointer">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">{item.icon} {item.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Explore {item.label.toLowerCase()} table</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Panel: Sectors
// ════════════════════════════════════════════════════════════════════

function SectorsPanel() {
  const { data: sectors, isLoading, error } = trpc.dataAnalysis.dataWarehouse.sectors.list.useQuery(undefined, {
    retry: false,
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Building2 className="h-6 w-6" />
          Sectors
        </h1>
        <Badge variant="outline" className="text-emerald-500 border-emerald-500/30">
          {sectors?.length ?? 0} rows
        </Badge>
      </div>
      <p className="text-muted-foreground">
        NAICS 2022 top-level sectors. Primary key: <code className="text-xs bg-muted px-1 py-0.5 rounded">sector_code</code>
      </p>
      {isLoading ? <LoadingState /> : error ? <ErrorState error={error.message} /> : !sectors?.length ? <EmptyState label="No sectors. Click 'Seed Database' on Overview." /> : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">sector_code (PK)</TableHead>
                  <TableHead>sector_title</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sectors.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell><Badge variant="outline" className="font-mono">{s.sectorCode}</Badge></TableCell>
                    <TableCell>{s.sectorTitle}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Panel: Industries
// ════════════════════════════════════════════════════════════════════

function IndustriesPanel() {
  const [sectorFilter, setSectorFilter] = useState<string>("all");
  const { data: sectors } = trpc.dataAnalysis.dataWarehouse.sectors.list.useQuery(undefined, { retry: false });
  const { data: industries, isLoading, error } = trpc.dataAnalysis.dataWarehouse.industries.list.useQuery(
    sectorFilter !== "all" ? { sectorCode: sectorFilter } : undefined,
    { retry: false }
  );

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Layers className="h-6 w-6" />
          Industries
        </h1>
        <Badge variant="outline" className="text-blue-500 border-blue-500/30">
          {industries?.length ?? 0} rows
        </Badge>
      </div>
      <p className="text-muted-foreground">
        NAICS 6-digit industry codes. Each belongs to exactly one sector.
        PK: <code className="text-xs bg-muted px-1 py-0.5 rounded">naics_code</code> /
        FK: <code className="text-xs bg-muted px-1 py-0.5 rounded">sector_code</code>
      </p>
      <div className="w-48">
        <Select value={sectorFilter} onValueChange={setSectorFilter}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Filter by sector" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sectors</SelectItem>
            {sectors?.map((s) => (
              <SelectItem key={s.id} value={s.sectorCode}>
                <span className="font-mono mr-1">{s.sectorCode}</span> {s.sectorTitle.length > 25 ? s.sectorTitle.slice(0, 25) + "..." : s.sectorTitle}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {isLoading ? <LoadingState /> : error ? <ErrorState error={error.message} /> : !industries?.length ? <EmptyState label="No industries. Click 'Seed Database' on Overview." /> : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">naics_code (PK)</TableHead>
                  <TableHead>industry_title</TableHead>
                  <TableHead className="w-32">sector_code (FK)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {industries.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell><Badge variant="outline" className="font-mono">{i.naicsCode}</Badge></TableCell>
                    <TableCell>{i.industryTitle}</TableCell>
                    <TableCell><Badge variant="secondary">{i.sectorCode}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Panel: Scopes
// ════════════════════════════════════════════════════════════════════

function ScopesPanel() {
  const [sectorFilter, setSectorFilter] = useState<string>("all");
  const { data: sectors } = trpc.dataAnalysis.dataWarehouse.sectors.list.useQuery(undefined, { retry: false });
  const { data: scopes, isLoading, error } = trpc.dataAnalysis.dataWarehouse.scopes.list.useQuery(
    sectorFilter !== "all" ? { sectorCode: sectorFilter } : undefined,
    { retry: false }
  );

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileText className="h-6 w-6" />
          Scopes
        </h1>
        <Badge variant="outline" className="text-purple-500 border-purple-500/30">
          {scopes?.length ?? 0} rows
        </Badge>
      </div>
      <p className="text-muted-foreground">
        PM scope areas. Composite PK: <code className="text-xs bg-muted px-1 py-0.5 rounded">(sector_code, scope_id)</code>.
        Same scope_id has different meanings across sectors.
      </p>
      <div className="w-48">
        <Select value={sectorFilter} onValueChange={setSectorFilter}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Filter by sector" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sectors</SelectItem>
            {sectors?.map((s) => (
              <SelectItem key={s.id} value={s.sectorCode}>
                <span className="font-mono mr-1">{s.sectorCode}</span> {s.sectorTitle.length > 25 ? s.sectorTitle.slice(0, 25) + "..." : s.sectorTitle}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {isLoading ? <LoadingState /> : error ? <ErrorState error={error.message} /> : !scopes?.length ? <EmptyState label="No scopes. Click 'Seed Database' on Overview." /> : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">sector_code (PK)</TableHead>
                  <TableHead className="w-24">scope_id (PK)</TableHead>
                  <TableHead>scope_label</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scopes.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell><Badge variant="secondary">{s.sectorCode}</Badge></TableCell>
                    <TableCell><Badge variant="outline" className="font-mono">{s.scopeId}</Badge></TableCell>
                    <TableCell className="text-sm">{s.scopeLabel}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Panel: Standards
// ════════════════════════════════════════════════════════════════════

function StandardsPanel() {
  const { data: standards, isLoading, error } = trpc.dataAnalysis.dataWarehouse.standards.list.useQuery(undefined, {
    retry: false,
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="h-6 w-6" />
          Standards
        </h1>
        <Badge variant="outline" className="text-amber-500 border-amber-500/30">
          {standards?.length ?? 0} rows
        </Badge>
      </div>
      <p className="text-muted-foreground">
        PM, ISO, and governance standards. PK: <code className="text-xs bg-muted px-1 py-0.5 rounded">standard_code</code>.
      </p>
      {isLoading ? <LoadingState /> : error ? <ErrorState error={error.message} /> : !standards?.length ? <EmptyState label="No standards. Click 'Seed Database' on Overview." /> : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">standard_code (PK)</TableHead>
                  <TableHead>standard_name</TableHead>
                  <TableHead className="w-48">issuing_body</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {standards.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell><Badge variant="outline" className="font-mono text-xs">{s.standardCode}</Badge></TableCell>
                    <TableCell className="text-sm">{s.standardName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{s.issuingBody}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Panel: Mappings (Junction table)
// ════════════════════════════════════════════════════════════════════

function MappingsPanel() {
  const { data: mappings, isLoading, error } = trpc.dataAnalysis.dataWarehouse.mappings.search.useQuery(undefined, {
    retry: false,
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Link2 className="h-6 w-6" />
          Mappings
        </h1>
        <Badge variant="outline" className="text-rose-500 border-rose-500/30">
          {mappings?.length ?? 0} rows
        </Badge>
      </div>
      <p className="text-muted-foreground">
        Cross-reference junction table. Composite PK: <code className="text-xs bg-muted px-1 py-0.5 rounded">(naics_code, scope_id, standard_code)</code>
      </p>
      {isLoading ? <LoadingState /> : error ? <ErrorState error={error.message} /> : !mappings?.length ? <EmptyState label="No mappings. Click 'Seed Database' on Overview." /> : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">naics_code</TableHead>
                  <TableHead className="w-20">scope_id</TableHead>
                  <TableHead className="w-40">standard_code</TableHead>
                  <TableHead>relevance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mappings.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell><Badge variant="outline" className="font-mono">{m.naicsCode}</Badge></TableCell>
                    <TableCell><Badge variant="secondary" className="font-mono">{m.scopeId}</Badge></TableCell>
                    <TableCell className="text-sm font-medium">{m.standardCode}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{m.relevance}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Panel: Schema (DDL + ER)
// ════════════════════════════════════════════════════════════════════

function SchemaPanel() {
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Code2 className="h-6 w-6" />
        Relational Schema (3NF)
      </h1>
      <p className="text-muted-foreground">
        5-table normalized design derived from the flat 11-column CSV
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-mono">SQL DDL</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto whitespace-pre font-mono leading-relaxed">
{`-- Table 1: dw_sectors
CREATE TABLE dw_sectors (
  id            SERIAL       PRIMARY KEY,
  sector_code   VARCHAR(10)  NOT NULL UNIQUE,
  sector_title  VARCHAR(255) NOT NULL
);

-- Table 2: dw_industries
CREATE TABLE dw_industries (
  id              SERIAL       PRIMARY KEY,
  naics_code      VARCHAR(10)  NOT NULL UNIQUE,
  industry_title  VARCHAR(255) NOT NULL,
  sector_code     VARCHAR(10)  NOT NULL
);
CREATE INDEX idx_dw_industries_sector ON dw_industries(sector_code);

-- Table 3: dw_scopes
CREATE TABLE dw_scopes (
  id                SERIAL       PRIMARY KEY,
  sector_code       VARCHAR(10)  NOT NULL,
  scope_id          VARCHAR(10)  NOT NULL,
  scope_label       VARCHAR(255) NOT NULL,
  scope_description TEXT         NOT NULL DEFAULT ''
);
CREATE INDEX idx_dw_scopes_sector ON dw_scopes(sector_code);

-- Table 4: dw_standards
CREATE TABLE dw_standards (
  id             SERIAL       PRIMARY KEY,
  standard_code  VARCHAR(100) NOT NULL UNIQUE,
  standard_name  VARCHAR(500) NOT NULL,
  issuing_body   VARCHAR(255) NOT NULL
);

-- Table 5: dw_industry_scope_standards (junction)
CREATE TABLE dw_industry_scope_standards (
  id                       SERIAL       PRIMARY KEY,
  naics_code               VARCHAR(10)  NOT NULL,
  sector_code              VARCHAR(10)  NOT NULL,
  scope_id                 VARCHAR(10)  NOT NULL,
  standard_code            VARCHAR(100) NOT NULL,
  standard_name_contextual VARCHAR(500),
  relevance                TEXT         NOT NULL
);
CREATE INDEX idx_dw_iss_naics    ON dw_industry_scope_standards(naics_code);
CREATE INDEX idx_dw_iss_scope    ON dw_industry_scope_standards(scope_id);
CREATE INDEX idx_dw_iss_standard ON dw_industry_scope_standards(standard_code);
CREATE INDEX idx_dw_iss_sector   ON dw_industry_scope_standards(sector_code);`}
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-mono">Entity-Relationship Diagram</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto whitespace-pre font-mono leading-relaxed">
{`┌──────────────┐
│  dw_sectors  │
│──────────────│
│ sector_code  │ UNIQUE
│ sector_title │
└──────┬───────┘
       │ 1:N
       ├──────────────────────────┐
       ▼                         ▼
┌──────────────────┐  ┌───────────────────────┐
│  dw_industries   │  │      dw_scopes        │
│──────────────────│  │───────────────────────│
│ naics_code    UQ │  │ sector_code           │
│ industry_title   │  │ scope_id              │
│ sector_code   FK │  │ scope_label           │
└──────┬───────────┘  │ scope_description     │
       │              └───────────┬───────────┘
       │                         │
       │    N : M : N            │
       ▼                         ▼
┌─────────────────────────────────────────┐
│  dw_industry_scope_standards           │
│─────────────────────────────────────────│
│ naics_code                   FK → ind. │
│ sector_code                  FK → sec. │
│ scope_id                     FK → sco. │
│ standard_code                FK → std. │
│ standard_name_contextual               │
│ relevance                              │
└───────────────────┬─────────────────────┘
                    │
                    ▼
          ┌──────────────────┐
          │   dw_standards   │
          │──────────────────│
          │ standard_code UQ │
          │ standard_name    │
          │ issuing_body     │
          └──────────────────┘`}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Panel: Explorer — drill-down records browser (live DB queries)
// ════════════════════════════════════════════════════════════════════

function ExplorerPanel() {
  const [sectorFilter, setSectorFilter] = useState<string>("all");
  const [industryFilter, setIndustryFilter] = useState<string>("all");
  const [scopeFilter, setScopeFilter] = useState<string>("all");
  const [searchText, setSearchText] = useState("");

  // Fetch filter options
  const { data: sectors } = trpc.dataAnalysis.dataWarehouse.sectors.list.useQuery(undefined, { retry: false });
  const { data: industries } = trpc.dataAnalysis.dataWarehouse.industries.list.useQuery(
    sectorFilter !== "all" ? { sectorCode: sectorFilter } : undefined,
    { retry: false }
  );
  const { data: scopes } = trpc.dataAnalysis.dataWarehouse.scopes.list.useQuery(
    sectorFilter !== "all" ? { sectorCode: sectorFilter } : undefined,
    { retry: false }
  );

  // Fetch filtered mappings
  const { data: mappings, isLoading, error } = trpc.dataAnalysis.dataWarehouse.mappings.search.useQuery(
    {
      sectorCode: sectorFilter !== "all" ? sectorFilter : undefined,
      naicsCode: industryFilter !== "all" ? industryFilter : undefined,
      scopeId: scopeFilter !== "all" ? scopeFilter : undefined,
      searchText: searchText.trim() || undefined,
    },
    { retry: false }
  );

  // Build lookup maps for display
  const industryMap = new Map<string, string>();
  industries?.forEach((i) => industryMap.set(i.naicsCode, i.industryTitle));

  const scopeMap = new Map<string, string>();
  scopes?.forEach((s) => scopeMap.set(s.scopeId, s.scopeLabel));

  const standardsQuery = trpc.dataAnalysis.dataWarehouse.standards.list.useQuery(undefined, { retry: false });
  const standardMap = new Map<string, { name: string; body: string }>();
  standardsQuery.data?.forEach((s) => standardMap.set(s.standardCode, { name: s.standardName, body: s.issuingBody }));

  // Reset child filters when parent changes
  const handleSectorChange = (v: string) => {
    setSectorFilter(v);
    setIndustryFilter("all");
    setScopeFilter("all");
  };
  const handleIndustryChange = (v: string) => {
    setIndustryFilter(v);
    setScopeFilter("all");
  };

  const clearAll = () => {
    setSectorFilter("all");
    setIndustryFilter("all");
    setScopeFilter("all");
    setSearchText("");
  };

  const hasFilters = sectorFilter !== "all" || industryFilter !== "all" || scopeFilter !== "all" || searchText.trim() !== "";

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Search className="h-6 w-6" />
          Records Explorer
        </h1>
        <Badge variant="outline" className="text-cyan-500 border-cyan-500/30">
          {mappings?.length ?? 0} records
        </Badge>
      </div>
      <p className="text-muted-foreground text-sm">
        Drill down by sector, industry and scope to explore ISO PM standard mappings.
      </p>

      {/* Filter bar */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium">Filters</span>
            {hasFilters && (
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={clearAll}>
                <X className="h-3 w-3 mr-1" /> Clear all
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {/* Sector */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Sector</label>
              <Select value={sectorFilter} onValueChange={handleSectorChange}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="All sectors" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sectors</SelectItem>
                  {sectors?.map((s) => (
                    <SelectItem key={s.id} value={s.sectorCode}>
                      <span className="font-mono mr-1">{s.sectorCode}</span> {s.sectorTitle.length > 30 ? s.sectorTitle.slice(0, 30) + "..." : s.sectorTitle}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Industry */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Industry</label>
              <Select value={industryFilter} onValueChange={handleIndustryChange}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="All industries" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All industries</SelectItem>
                  {industries?.map((i) => (
                    <SelectItem key={i.id} value={i.naicsCode}>
                      <span className="font-mono mr-1">{i.naicsCode}</span> {i.industryTitle.length > 28 ? i.industryTitle.slice(0, 28) + "..." : i.industryTitle}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Scope */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Scope</label>
              <Select value={scopeFilter} onValueChange={setScopeFilter}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="All scopes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All scopes</SelectItem>
                  {scopes?.map((s) => (
                    <SelectItem key={s.id} value={s.scopeId}>
                      <span className="font-mono mr-1">{s.scopeId}</span> {s.scopeLabel.length > 30 ? s.scopeLabel.slice(0, 30) + "..." : s.scopeLabel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Search */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Search</label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <Input
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="Search records..."
                  className="h-8 text-xs pl-7"
                />
              </div>
            </div>
          </div>
          {/* Active filter chips */}
          {hasFilters && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {sectorFilter !== "all" && (
                <Badge variant="secondary" className="text-xs gap-1">
                  Sector: {sectorFilter}
                  <X className="h-3 w-3 cursor-pointer" onClick={() => handleSectorChange("all")} />
                </Badge>
              )}
              {industryFilter !== "all" && (
                <Badge variant="secondary" className="text-xs gap-1">
                  NAICS: {industryFilter}
                  <X className="h-3 w-3 cursor-pointer" onClick={() => handleIndustryChange("all")} />
                </Badge>
              )}
              {scopeFilter !== "all" && (
                <Badge variant="secondary" className="text-xs gap-1">
                  Scope: {scopeFilter}
                  <X className="h-3 w-3 cursor-pointer" onClick={() => setScopeFilter("all")} />
                </Badge>
              )}
              {searchText.trim() && (
                <Badge variant="secondary" className="text-xs gap-1">
                  &quot;{searchText}&quot;
                  <X className="h-3 w-3 cursor-pointer" onClick={() => setSearchText("")} />
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {isLoading ? <LoadingState label="Querying database..." /> : error ? <ErrorState error={error.message} /> : !mappings?.length ? (
        <EmptyState label={hasFilters ? "No records match your filters. Try broadening your search." : "No mappings. Click 'Seed Database' on Overview."} />
      ) : (
        <div className="space-y-2">
          {mappings.map((r) => (
            <Card key={r.id} className="hover:border-primary/30 transition-colors">
              <CardContent className="p-4 space-y-2">
                {/* Row 1: Industry + NAICS + Scope badges */}
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="font-mono text-[10px]">{r.naicsCode}</Badge>
                  <span className="text-sm font-medium">{industryMap.get(r.naicsCode) || r.naicsCode}</span>
                  <Badge variant="secondary" className="font-mono text-[10px]">{r.scopeId}</Badge>
                  <span className="text-xs text-muted-foreground">{scopeMap.get(r.scopeId) || r.scopeId}</span>
                </div>
                {/* Row 2: Standard */}
                <div className="flex flex-wrap items-baseline gap-2">
                  <ShieldCheck className="h-3.5 w-3.5 text-amber-500 shrink-0 relative top-0.5" />
                  <span className="text-sm font-semibold">{r.standardCode}</span>
                  <span className="text-xs text-muted-foreground">({standardMap.get(r.standardCode)?.body || ""})</span>
                </div>
                <p className="text-xs text-muted-foreground">{r.standardNameContextual || standardMap.get(r.standardCode)?.name || ""}</p>
                {/* Row 3: Relevance */}
                <div className="bg-muted/50 rounded-md px-3 py-2">
                  <p className="text-xs leading-relaxed">{r.relevance}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Main Shell
// ════════════════════════════════════════════════════════════════════

export default function DataWarehousePage() {
  const [activeNav, setActiveNav] = useState<NavKey>("overview");
  const [collapsed, setCollapsed] = useState(true);

  const renderPanel = () => {
    switch (activeNav) {
      case "overview": return <OverviewPanel />;
      case "explorer": return <ExplorerPanel />;
      case "sectors": return <SectorsPanel />;
      case "industries": return <IndustriesPanel />;
      case "scopes": return <ScopesPanel />;
      case "standards": return <StandardsPanel />;
      case "mappings": return <MappingsPanel />;
      case "schema": return <SchemaPanel />;
      default: return <OverviewPanel />;
    }
  };

  return (
    <div className="-m-6 flex flex-col" style={{ height: "calc(100vh - 4rem)" }}>
      <div className="flex flex-1 overflow-hidden">
        <ShellSidebar
          active={activeNav}
          onSelect={setActiveNav}
          collapsed={collapsed}
          onToggle={() => setCollapsed(!collapsed)}
        />
        <main className="flex-1 min-w-0 overflow-y-auto">
          {renderPanel()}
        </main>
      </div>
      <ShellStatusBar />
    </div>
  );
}
