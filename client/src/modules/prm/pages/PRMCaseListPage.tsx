/**
 * PRM Case List Page — Filterable case queue
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PRMCaseCard } from "../components/PRMCaseCard";

const STATUSES = [
  "", "draft", "intake", "triage", "analysis", "decision_pending",
  "in_resolution", "resolved", "verification_pending", "verified_closed", "reopened", "cancelled",
];
const SEVERITIES = ["", "critical", "high", "medium", "low"];

export default function PRMCaseListPage() {
  const [filters, setFilters] = useState({ status: "", severity: "", search: "" });

  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.prm.cases.list.useQuery({
    status: (filters.status || undefined) as any,
    severity: (filters.severity || undefined) as any,
    search: filters.search || undefined,
    limit: 50,
    offset: 0,
  });

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold mb-4">PRM Cases</h1>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Input
          placeholder="Search cases..."
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          className="max-w-[200px] text-sm"
        />
        <select
          className="text-sm bg-transparent border rounded-md px-2 py-1.5"
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
        >
          <option value="">All Statuses</option>
          {STATUSES.filter(Boolean).map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
          ))}
        </select>
        <select
          className="text-sm bg-transparent border rounded-md px-2 py-1.5"
          value={filters.severity}
          onChange={(e) => setFilters({ ...filters, severity: e.target.value })}
        >
          <option value="">All Severities</option>
          {SEVERITIES.filter(Boolean).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
        </div>
      ) : !data?.rows?.length ? (
        <div className="border rounded-lg p-6 text-center">
          <p className="text-sm text-muted-foreground">No cases found.</p>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground mb-3">{data.total} case(s)</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.rows.map((c: any) => (
              <PRMCaseCard
                key={c.id}
                id={c.id}
                title={c.title}
                status={c.status}
                severity={c.severity}
                priority={c.priority}
                sourceType={c.sourceType}
                createdAt={c.createdAt}
                onDeleted={() => utils.prm.cases.list.invalidate()}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
