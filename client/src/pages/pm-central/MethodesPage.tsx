/**
 * MethodesPage — PM Central → Méthodes
 *
 * Governed methodology catalog organized into 8 categories.
 * Each method card shows description, strengths, governance compatibility,
 * gate model mapping, and delivery approach.
 *
 * Route: /pm-central/methodes  (top-level)
 *        /pm-central/methodes/:categoryId  (filtered by category)
 *        /pm-central/methodes/detail/:methodId  (single method detail)
 */

import { useState, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Blocks, Zap, Merge, Settings, Lightbulb, Server,
  Shield, Sparkles, Search, ChevronRight, ArrowLeft,
  CheckCircle, AlertTriangle, MinusCircle, ExternalLink,
  BookOpen, Target, Users, ShieldCheck, Wand2,
} from "lucide-react";
import {
  METHOD_CATEGORIES, ALL_METHODS, getMethodsByCategory, getMethodById, getCategoryById,
  type MethodCategory, type MethodDefinition,
} from "@shared/pm-methods-catalog";

// ── Icon mapping ──

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  "predictive": <Blocks className="h-5 w-5" />,
  "agile": <Zap className="h-5 w-5" />,
  "hybrid": <Merge className="h-5 w-5" />,
  "process": <Settings className="h-5 w-5" />,
  "product": <Lightbulb className="h-5 w-5" />,
  "it-delivery": <Server className="h-5 w-5" />,
  "governance": <Shield className="h-5 w-5" />,
  "emerging": <Sparkles className="h-5 w-5" />,
};

const GOV_COMPAT_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "outline"; icon: React.ReactNode }> = {
  "full": { label: "Full", variant: "default", icon: <CheckCircle className="h-3 w-3" /> },
  "partial": { label: "Partial", variant: "secondary", icon: <AlertTriangle className="h-3 w-3" /> },
  "minimal": { label: "Minimal", variant: "outline", icon: <MinusCircle className="h-3 w-3" /> },
};

const APPROACH_COLORS: Record<string, string> = {
  "predictive": "bg-blue-500/10 text-blue-600 border-blue-500/30",
  "agile": "bg-green-500/10 text-green-600 border-green-500/30",
  "hybrid": "bg-yellow-500/10 text-yellow-700 border-yellow-500/30",
};

// ── Main page ──

export default function MethodesPage() {
  const [, setLocation] = useLocation();
  const [, categoryParams] = useRoute("/pm-central/methodes/:categoryId");
  const [, detailParams] = useRoute("/pm-central/methodes/detail/:methodId");

  // If detail view
  if (detailParams?.methodId) {
    return <MethodDetailView methodId={detailParams.methodId} />;
  }

  const activeCategoryId = categoryParams?.categoryId || null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <BookOpen className="h-6 w-6" />
          Méthodes
        </h1>
        <p className="text-muted-foreground mt-1">
          Governed methodology catalog — 8 categories, {ALL_METHODS.length} methods. Each method is mapped to the governance gate model.
        </p>
      </div>

      {activeCategoryId ? (
        <CategoryView categoryId={activeCategoryId} />
      ) : (
        <CatalogOverview />
      )}
    </div>
  );
}

// ── Catalog overview — shows all 8 categories ──

function CatalogOverview() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");

  const filteredMethods = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    return ALL_METHODS.filter((m) =>
      m.name.toLowerCase().includes(q) ||
      m.description.toLowerCase().includes(q) ||
      m.categoryId.toLowerCase().includes(q)
    );
  }, [search]);

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search methods..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Search results */}
      {filteredMethods ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{filteredMethods.length} results for "{search}"</p>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {filteredMethods.map((method) => (
              <MethodCard key={method.id} method={method} onClick={() => setLocation(`/pm-central/methodes/detail/${method.id}`)} />
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Philosophy summary */}
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
            {[
              { label: "Predictive", count: getMethodsByCategory("predictive").length, desc: "Plan first, execute sequentially", color: "border-blue-500/50" },
              { label: "Agile", count: getMethodsByCategory("agile").length, desc: "Adapt continuously", color: "border-green-500/50" },
              { label: "Hybrid", count: getMethodsByCategory("hybrid").length, desc: "Mix planning + adaptation", color: "border-yellow-500/50" },
              { label: "Process", count: getMethodsByCategory("process").length, desc: "Optimize flow & reduce waste", color: "border-purple-500/50" },
            ].map((item) => (
              <Card key={item.label} className={`border-l-4 ${item.color}`}>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold">{item.count}</div>
                  <div className="text-sm font-medium">{item.label}</div>
                  <div className="text-xs text-muted-foreground mt-1">{item.desc}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Category grid */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {METHOD_CATEGORIES.map((cat) => {
              const methods = getMethodsByCategory(cat.id);
              const fullGov = methods.filter((m) => m.governanceCompatibility === "full").length;

              return (
                <Card
                  key={cat.id}
                  className="cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => setLocation(`/pm-central/methodes/${cat.id}`)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded ${cat.color} text-white`}>
                          {CATEGORY_ICONS[cat.id]}
                        </div>
                        <CardTitle className="text-sm font-medium">{cat.shortLabel}</CardTitle>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground mb-2">{cat.philosophy}</p>
                    <div className="flex items-center justify-between text-xs">
                      <span>{methods.length} methods</span>
                      <span className="text-muted-foreground">{fullGov} full gov</span>
                    </div>
                    {/* Method name list */}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {methods.slice(0, 4).map((m) => (
                        <Badge key={m.id} variant="outline" className="text-[10px] px-1.5 py-0">
                          {m.name.length > 15 ? m.name.slice(0, 15) + "..." : m.name}
                        </Badge>
                      ))}
                      {methods.length > 4 && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          +{methods.length - 4}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Governance compatibility legend */}
          <Card className="bg-muted/30">
            <CardContent className="py-4">
              <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" />
                Governance Gate Compatibility
              </h3>
              <div className="grid gap-2 md:grid-cols-3 text-xs">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                  <span><strong>Full</strong> — Native gate structure, maps 1:1 to G0–G4</span>
                </div>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />
                  <span><strong>Partial</strong> — Some gates map naturally, others need adaptation</span>
                </div>
                <div className="flex items-center gap-2">
                  <MinusCircle className="h-3.5 w-3.5 text-muted-foreground" />
                  <span><strong>Minimal</strong> — Lightweight or flow-based; gates overlaid externally</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ── Category view — shows all methods in one category ──

function CategoryView({ categoryId }: { categoryId: string }) {
  const [, setLocation] = useLocation();
  const category = getCategoryById(categoryId);
  const methods = getMethodsByCategory(categoryId);

  if (!category) {
    return (
      <div className="text-center py-10">
        <p className="text-muted-foreground">Unknown category: {categoryId}</p>
        <Button variant="outline" className="mt-4" onClick={() => setLocation("/pm-central/methodes")}>
          Back to Catalog
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={() => setLocation("/pm-central/methodes")}>
        <ArrowLeft className="h-4 w-4 mr-1" />
        All Categories
      </Button>

      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${category.color} text-white`}>
          {CATEGORY_ICONS[categoryId]}
        </div>
        <div>
          <h2 className="text-xl font-bold">{category.label}</h2>
          <p className="text-sm text-muted-foreground">{category.philosophy} — {methods.length} methods</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {methods.map((method) => (
          <MethodCard
            key={method.id}
            method={method}
            onClick={() => setLocation(`/pm-central/methodes/detail/${method.id}`)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Method card — used in grid views ──

function MethodCard({ method, onClick }: { method: MethodDefinition; onClick: () => void }) {
  const govBadge = GOV_COMPAT_BADGE[method.governanceCompatibility];

  return (
    <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={onClick}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">{method.name}</CardTitle>
          <Badge variant={govBadge.variant} className="text-[10px] flex items-center gap-1">
            {govBadge.icon}
            {govBadge.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{method.description}</p>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`text-[10px] border ${APPROACH_COLORS[method.deliveryApproach]}`}>
            {method.deliveryApproach}
          </Badge>
          <span className="text-[10px] text-muted-foreground">{method.origin}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Method detail view ──

function MethodDetailView({ methodId }: { methodId: string }) {
  const [, setLocation] = useLocation();
  const method = getMethodById(methodId);
  const category = method ? getCategoryById(method.categoryId) : null;

  if (!method || !category) {
    return (
      <div className="text-center py-10">
        <p className="text-muted-foreground">Method not found: {methodId}</p>
        <Button variant="outline" className="mt-4" onClick={() => setLocation("/pm-central/methodes")}>
          Back to Catalog
        </Button>
      </div>
    );
  }

  const govBadge = GOV_COMPAT_BADGE[method.governanceCompatibility];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <button className="hover:text-foreground" onClick={() => setLocation("/pm-central/methodes")}>
          Méthodes
        </button>
        <ChevronRight className="h-3 w-3" />
        <button className="hover:text-foreground" onClick={() => setLocation(`/pm-central/methodes/${method.categoryId}`)}>
          {category.shortLabel}
        </button>
        <ChevronRight className="h-3 w-3" />
        <span className="text-foreground font-medium">{method.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start gap-4">
        <div className={`p-3 rounded-lg ${category.color} text-white shrink-0`}>
          {CATEGORY_ICONS[method.categoryId]}
        </div>
        <div>
          <h1 className="text-2xl font-bold">{method.name}</h1>
          <p className="text-muted-foreground mt-1">{method.description}</p>
          <div className="flex items-center gap-3 mt-3">
            <Badge variant={govBadge.variant} className="flex items-center gap-1">
              {govBadge.icon}
              Governance: {govBadge.label}
            </Badge>
            <Badge variant="outline" className={`border ${APPROACH_COLORS[method.deliveryApproach]}`}>
              {method.deliveryApproach}
            </Badge>
            <span className="text-xs text-muted-foreground">Origin: {method.origin}</span>
          </div>
        </div>
      </div>

      {/* Strengths */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Target className="h-4 w-4" />
            Key Strengths
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1">
            {method.strengths.map((s, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
                {s}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Best For */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Users className="h-4 w-4" />
            Best For
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {method.bestFor.map((b, i) => (
              <Badge key={i} variant="secondary" className="text-xs">{b}</Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Gate Model Mapping */}
      {method.gateModel && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              Gate Model Mapping
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{method.gateModel}</p>
            <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                {["G0", "G1", "G2", "G3", "G4"].map((g) => (
                  <span
                    key={g}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                      method.governanceCompatibility === "full"
                        ? "bg-primary/10 text-primary"
                        : method.governanceCompatibility === "partial"
                        ? "bg-muted text-muted-foreground"
                        : "bg-muted/50 text-muted-foreground/50"
                    }`}
                  >
                    {g}
                  </span>
                ))}
              </div>
              <span className="ml-2">
                {method.governanceCompatibility === "full"
                  ? "All gates natively supported"
                  : method.governanceCompatibility === "partial"
                  ? "Some gates require adaptation"
                  : "Gates overlaid externally"
                }
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick use action */}
      <Card className="bg-muted/30">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Use this method in a project</p>
              <p className="text-xs text-muted-foreground">Create a new PM Shell with {method.name} as the selected methodology</p>
            </div>
            <Button size="sm" onClick={() => setLocation("/pm-central/shell/new")}>
              <Wand2 className="h-3.5 w-3.5 mr-1" />
              New Project
            </Button>
          </div>
        </CardContent>
      </Card>

      <Button variant="outline" onClick={() => setLocation(`/pm-central/methodes/${method.categoryId}`)}>
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back to {category.shortLabel}
      </Button>
    </div>
  );
}
