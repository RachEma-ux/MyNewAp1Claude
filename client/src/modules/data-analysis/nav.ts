/**
 * Data Analysis — Module navigation.
 *
 * Pure data. The platform's nav composer reads this; modules do not
 * render their own top-level sidebar.
 *
 * All hrefs MUST be canonical Data Analysis routes under
 * `/data-analysis/*`. Pointing nav at legacy page paths or at
 * `/data-analysis/kgra-agent` (KGRA RTLM, not a Data Analysis
 * subdomain) is a boundary violation enforced by
 * `check:module-route-inventory` and `check:cross-module-links`.
 *
 * Subdomains: GraphRAG, Data Acquisition (with 10 tabs), Data
 * Warehouse. KGRA Agent is intentionally absent — separate RTLM.
 */

export interface DataAnalysisNavEntry {
  label: string;
  href: string;
  /** Optional grouping for sidebar ordering. */
  group?: string;
  order?: number;
}

export const dataAnalysisNav: DataAnalysisNavEntry[] = [
  { label: "Data Analysis", href: "/data-analysis", group: "dataAnalysis", order: 0 },
  { label: "GraphRAG", href: "/data-analysis/graphrag", group: "dataAnalysis", order: 1 },
  {
    label: "Data Acquisition",
    href: "/data-analysis/data-acquisition",
    group: "dataAnalysis",
    order: 2,
  },
  {
    label: "Sources",
    href: "/data-analysis/data-acquisition/sources",
    group: "dataAnalysis.dataAcquisition",
    order: 0,
  },
  {
    label: "Runs",
    href: "/data-analysis/data-acquisition/runs",
    group: "dataAnalysis.dataAcquisition",
    order: 1,
  },
  {
    label: "Items",
    href: "/data-analysis/data-acquisition/items",
    group: "dataAnalysis.dataAcquisition",
    order: 2,
  },
  {
    label: "Classification",
    href: "/data-analysis/data-acquisition/classification",
    group: "dataAnalysis.dataAcquisition",
    order: 3,
  },
  {
    label: "Routing",
    href: "/data-analysis/data-acquisition/routing",
    group: "dataAnalysis.dataAcquisition",
    order: 4,
  },
  {
    label: "Processing",
    href: "/data-analysis/data-acquisition/processing",
    group: "dataAnalysis.dataAcquisition",
    order: 5,
  },
  {
    label: "Document Intelligence",
    href: "/data-analysis/data-acquisition/document-intelligence",
    group: "dataAnalysis.dataAcquisition",
    order: 6,
  },
  {
    label: "Canonical Records",
    href: "/data-analysis/data-acquisition/canonical-records",
    group: "dataAnalysis.dataAcquisition",
    order: 7,
  },
  {
    label: "Outputs",
    href: "/data-analysis/data-acquisition/outputs",
    group: "dataAnalysis.dataAcquisition",
    order: 8,
  },
  {
    label: "Settings",
    href: "/data-analysis/data-acquisition/settings",
    group: "dataAnalysis.dataAcquisition",
    order: 9,
  },
  {
    label: "Data Warehouse",
    href: "/data-analysis/data-warehouse",
    group: "dataAnalysis",
    order: 3,
  },
];
