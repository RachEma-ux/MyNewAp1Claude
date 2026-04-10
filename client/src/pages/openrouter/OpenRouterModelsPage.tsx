import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Database } from "lucide-react";

export default function OpenRouterModelsPage() {
  const [search, setSearch] = useState("");
  const [provider, setProvider] = useState<string>("");
  const [capability, setCapability] = useState<string>("");

  const models = trpc.openRouter.models.list.useQuery({
    search: search || undefined,
    provider: provider || undefined,
    capability: capability as any || undefined,
    limit: 200,
  });
  const providers = trpc.openRouter.models.providers.useQuery();

  const data = models.data;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Model Catalog</h3>
          <p className="text-sm text-muted-foreground">
            {data?.total ?? 0} models synced
            {search || provider || capability ? ` (filtered from ${data?.total ?? 0})` : ""}
          </p>
        </div>
        {data?.total === 0 && (
          <Badge variant="outline" className="text-[10px] text-orange-500 border-orange-500">
            Sync models from Connect page
          </Badge>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search models..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-sm" />
        </div>
        <Select value={provider} onValueChange={setProvider}>
          <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="Provider" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Providers</SelectItem>
            {(providers.data ?? []).map((p) => <SelectItem key={p} value={p!}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={capability} onValueChange={setCapability}>
          <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="Capability" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">All</SelectItem>
            <SelectItem value="chat">Chat</SelectItem>
            <SelectItem value="embedding">Embedding</SelectItem>
            <SelectItem value="toolCalling">Tool Calling</SelectItem>
            <SelectItem value="vision">Vision</SelectItem>
            <SelectItem value="structuredOutput">Structured Output</SelectItem>
            <SelectItem value="reasoning">Reasoning</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Context</TableHead>
                <TableHead>Pricing ($/1M)</TableHead>
                <TableHead>Capabilities</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(!data || data.models.length === 0) && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  {models.isLoading ? "Loading..." : "No models. Connect and sync first."}
                </TableCell></TableRow>
              )}
              {data?.models.map((m) => {
                const caps = m.capabilities as any;
                return (
                  <TableRow key={m.id}>
                    <TableCell>
                      <div className="font-medium text-sm">{m.name}</div>
                      <div className="text-[10px] text-muted-foreground">{m.modelId}</div>
                    </TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{m.providerSlug}</Badge></TableCell>
                    <TableCell className="text-xs">{m.contextLength ? `${(m.contextLength / 1000).toFixed(0)}k` : "—"}</TableCell>
                    <TableCell className="text-xs">
                      {m.promptPricing != null ? (
                        <span>${m.promptPricing.toFixed(2)} / ${m.completionPricing?.toFixed(2) ?? "—"}</span>
                      ) : "Free"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-0.5">
                        {caps?.chat && <Badge variant="secondary" className="text-[8px] h-4 px-1">chat</Badge>}
                        {caps?.toolCalling && <Badge variant="secondary" className="text-[8px] h-4 px-1">tools</Badge>}
                        {caps?.vision && <Badge variant="secondary" className="text-[8px] h-4 px-1">vision</Badge>}
                        {caps?.embedding && <Badge variant="secondary" className="text-[8px] h-4 px-1">embed</Badge>}
                        {caps?.reasoning && <Badge variant="default" className="text-[8px] h-4 px-1">reasoning</Badge>}
                        {caps?.structuredOutput && <Badge variant="secondary" className="text-[8px] h-4 px-1">json</Badge>}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
