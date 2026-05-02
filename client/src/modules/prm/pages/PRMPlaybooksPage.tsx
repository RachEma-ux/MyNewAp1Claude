/**
 * PRM Playbooks Page — Domain playbooks
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Loader2, BookOpen } from "lucide-react";

const DOMAINS = [
  { key: "", label: "All Domains" },
  { key: "it_service", label: "IT Service" },
  { key: "manufacturing", label: "Manufacturing" },
  { key: "customer", label: "Customer" },
  { key: "cross_functional", label: "Cross-Functional" },
  { key: "general", label: "General" },
];

export default function PRMPlaybooksPage() {
  const [domain, setDomain] = useState("");
  const { data: playbooks, isLoading } = trpc.prm.playbooks.list.useQuery(
    domain ? { domain } : undefined
  );

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold mb-4 flex items-center gap-2">
        <BookOpen className="h-5 w-5 text-orange-500" />
        Playbooks
      </h1>

      <div className="flex items-center gap-2 mb-4">
        {DOMAINS.map((d) => (
          <button
            key={d.key}
            onClick={() => setDomain(d.key)}
            className={`px-3 py-1 text-xs rounded-full border transition-colors ${
              domain === d.key
                ? "bg-primary/10 text-primary border-primary/20"
                : "text-muted-foreground hover:text-foreground border-transparent"
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
        </div>
      ) : !playbooks?.length ? (
        <div className="border rounded-lg p-6 text-center">
          <p className="text-sm text-muted-foreground">No playbooks available yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {playbooks.map((pb: any) => (
            <div key={pb.id} className="border rounded-lg p-4 hover:bg-muted/30 transition-colors">
              <h3 className="text-sm font-medium mb-1">{pb.title}</h3>
              {pb.description && (
                <p className="text-xs text-muted-foreground line-clamp-2">{pb.description}</p>
              )}
              <div className="flex items-center gap-2 mt-2 text-[10px]">
                {pb.domain && (
                  <span className="text-muted-foreground capitalize">{pb.domain.replace(/_/g, " ")}</span>
                )}
                {pb.published && (
                  <span className="text-green-500">Published</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
