import { useRoute } from "wouter";
import { ShieldCheck } from "lucide-react";

export default function GovernanceCenterPage() {
  const [, params] = useRoute("/governance-center/:item");
  const item = params?.item || "item-1";
  const label = "Gov " + item.replace("-", " ").replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
      <div className="flex items-center justify-center h-20 w-20 rounded-2xl bg-primary/10">
        <ShieldCheck className="h-8 w-8 text-primary" />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">Governance Center — {label}</h1>
      <p className="text-muted-foreground text-lg">Coming soon</p>
    </div>
  );
}
