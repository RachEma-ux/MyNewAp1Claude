/**
 * PS Version Selector — shared by multiple control panel tabs
 */
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function PSVersionSelector({
  selectedVersionId,
  onSelectVersion,
}: {
  selectedVersionId: number | null;
  onSelectVersion: (id: number) => void;
}) {
  const { data: versions } = trpc.ps.matrix.listVersions.useQuery();

  if (!versions || versions.length === 0) {
    return <p className="text-sm text-muted-foreground">No versions. Create one in the Versions tab.</p>;
  }

  const statusColor = (s: string) => {
    if (s === "active") return "text-green-600 border-green-500/30";
    if (s === "draft") return "text-yellow-600 border-yellow-500/30";
    return "text-muted-foreground";
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-sm text-muted-foreground">Version:</span>
      {versions.map((v) => (
        <Button
          key={v.id}
          size="sm"
          variant={selectedVersionId === v.id ? "default" : "outline"}
          onClick={() => onSelectVersion(v.id)}
          className="text-xs"
        >
          {v.version} <Badge variant="outline" className={`ml-1 text-[10px] ${statusColor(v.status)}`}>{v.status}</Badge>
        </Button>
      ))}
    </div>
  );
}
