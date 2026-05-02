/**
 * PRM Methods Library — Method cards with category, description, when-to-use
 */
import { trpc } from "@/lib/trpc";
import { Loader2, Wrench } from "lucide-react";

const CATEGORY_COLORS: Record<string, string> = {
  analytical: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  creative: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  scientific: "bg-teal-500/10 text-teal-500 border-teal-500/20",
  optimization: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  process: "bg-green-500/10 text-green-500 border-green-500/20",
  design: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
};

export default function PRMMethodsLibraryPage() {
  const { data: catalog, isLoading } = trpc.prm.methods.catalog.useQuery();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold mb-4 flex items-center gap-2">
        <Wrench className="h-5 w-5 text-orange-500" />
        Methods Library
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        Problem resolution methods available for diagnosis and investigation.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {catalog?.map((method: any) => (
          <div key={method.methodType} className="border rounded-lg p-4 hover:bg-muted/30 transition-colors">
            <div className="flex items-start justify-between gap-2 mb-2">
              <h3 className="text-sm font-medium">{method.name}</h3>
              <span
                className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                  CATEGORY_COLORS[method.category] || "bg-zinc-500/10 text-zinc-500 border-zinc-500/20"
                }`}
              >
                {method.category}
              </span>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-3">{method.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
