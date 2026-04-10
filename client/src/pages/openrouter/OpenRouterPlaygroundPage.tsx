import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Send, MessageSquare, Hash, Clock, DollarSign } from "lucide-react";
import { toast } from "sonner";

export default function OpenRouterPlaygroundPage() {
  return (
    <div className="p-6 max-w-4xl">
      <h3 className="text-lg font-semibold mb-1">Playground</h3>
      <p className="text-sm text-muted-foreground mb-4">Test models with real requests. All calls go through platform governance.</p>

      <Tabs defaultValue="chat">
        <TabsList>
          <TabsTrigger value="chat">Chat</TabsTrigger>
          <TabsTrigger value="structured">Structured Output</TabsTrigger>
          <TabsTrigger value="embedding">Embeddings</TabsTrigger>
        </TabsList>
        <TabsContent value="chat" className="mt-3"><ChatTab /></TabsContent>
        <TabsContent value="structured" className="mt-3"><StructuredTab /></TabsContent>
        <TabsContent value="embedding" className="mt-3"><EmbeddingTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function ChatTab() {
  const [model, setModel] = useState("openai/gpt-4o-mini");
  const [system, setSystem] = useState("");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<any>(null);

  const models = trpc.openRouter.models.list.useQuery({ limit: 100, capability: "chat" });
  const chatMut = trpc.openRouter.playground.chat.useMutation();
  const profiles = trpc.openRouter.routing.listProfiles.useQuery();
  const [profileId, setProfileId] = useState<string>("");

  const handleSend = async () => {
    if (!message.trim()) return;
    const messages: any[] = [];
    if (system.trim()) messages.push({ role: "system", content: system.trim() });
    messages.push({ role: "user", content: message.trim() });

    try {
      const res = await chatMut.mutateAsync({
        model,
        messages,
        routingProfileId: profileId ? parseInt(profileId) : undefined,
      });
      setResult(res);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Select value={model} onValueChange={setModel}>
          <SelectTrigger className="w-64 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{(models.data?.models ?? []).slice(0, 50).map((m) => <SelectItem key={m.modelId} value={m.modelId}>{m.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={profileId} onValueChange={setProfileId}>
          <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="Routing" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">Default</SelectItem>
            {(profiles.data ?? []).map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <Input placeholder="System prompt (optional)" value={system} onChange={(e) => setSystem(e.target.value)} className="h-8 text-sm" />
      <div className="flex gap-2">
        <Input placeholder="Type your message..." value={message} onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSend()} className="flex-1" />
        <Button onClick={handleSend} disabled={chatMut.isPending || !message.trim()}>
          {chatMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
      {result && <ResponseCard result={result} />}
    </div>
  );
}

function StructuredTab() {
  const [model, setModel] = useState("openai/gpt-4o-mini");
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<any>(null);
  const models = trpc.openRouter.models.list.useQuery({ limit: 50, capability: "structuredOutput" });
  const structMut = trpc.openRouter.playground.structured.useMutation();

  const handleSend = async () => {
    if (!prompt.trim()) return;
    try {
      const res = await structMut.mutateAsync({
        model,
        messages: [
          { role: "system", content: "Respond with valid JSON only." },
          { role: "user", content: prompt.trim() },
        ],
        schema: { type: "object" },
      });
      setResult(res);
    } catch (err) { toast.error((err as Error).message); }
  };

  return (
    <div className="space-y-3">
      <Select value={model} onValueChange={setModel}>
        <SelectTrigger className="w-64 h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>{(models.data?.models ?? []).slice(0, 50).map((m) => <SelectItem key={m.modelId} value={m.modelId}>{m.name}</SelectItem>)}</SelectContent>
      </Select>
      <div className="flex gap-2">
        <Input placeholder="Describe the JSON you want..." value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSend()} className="flex-1" />
        <Button onClick={handleSend} disabled={structMut.isPending}>{structMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}</Button>
      </div>
      {result && <ResponseCard result={result} />}
    </div>
  );
}

function EmbeddingTab() {
  const [model, setModel] = useState("openai/text-embedding-3-small");
  const [text, setText] = useState("");
  const [result, setResult] = useState<any>(null);
  const models = trpc.openRouter.models.list.useQuery({ limit: 50, capability: "embedding" });
  const embedMut = trpc.openRouter.playground.embedding.useMutation();

  const handleEmbed = async () => {
    if (!text.trim()) return;
    try {
      const res = await embedMut.mutateAsync({ model, input: [text.trim()] });
      setResult(res);
    } catch (err) { toast.error((err as Error).message); }
  };

  return (
    <div className="space-y-3">
      <Select value={model} onValueChange={setModel}>
        <SelectTrigger className="w-64 h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>{(models.data?.models ?? []).slice(0, 20).map((m) => <SelectItem key={m.modelId} value={m.modelId}>{m.name}</SelectItem>)}</SelectContent>
      </Select>
      <div className="flex gap-2">
        <Input placeholder="Text to embed..." value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleEmbed()} className="flex-1" />
        <Button onClick={handleEmbed} disabled={embedMut.isPending}>{embedMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Hash className="w-4 h-4" />}</Button>
      </div>
      {result && (
        <Card>
          <CardContent className="pt-3 pb-3 space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <Badge variant="outline">embedding</Badge>
              <span className="text-muted-foreground">{result.latencyMs}ms</span>
              <span className="text-muted-foreground">{result.usage?.total_tokens} tokens</span>
            </div>
            <div className="text-xs font-mono bg-muted/50 rounded p-2 max-h-32 overflow-auto">
              [{result.data?.[0]?.embedding?.slice(0, 8).map((n: number) => n.toFixed(4)).join(", ")}...]
              <span className="text-muted-foreground"> ({result.data?.[0]?.embedding?.length} dims)</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ResponseCard({ result }: { result: any }) {
  const choice = result.choices?.[0];
  return (
    <Card>
      <CardContent className="pt-3 pb-3 space-y-2">
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <Badge variant="outline">{result.model}</Badge>
          {result.provider && <Badge variant="secondary" className="text-[9px]">{result.provider}</Badge>}
          <div className="flex items-center gap-1 text-muted-foreground"><Clock className="w-3 h-3" />{result.latencyMs}ms</div>
          {result.usage && <div className="flex items-center gap-1 text-muted-foreground"><MessageSquare className="w-3 h-3" />{result.usage.total_tokens} tok</div>}
        </div>
        <div className="text-sm whitespace-pre-wrap">{choice?.message?.content ?? "No response"}</div>
        {choice?.finish_reason && choice.finish_reason !== "stop" && (
          <Badge variant="secondary" className="text-[9px]">finish: {choice.finish_reason}</Badge>
        )}
      </CardContent>
    </Card>
  );
}
