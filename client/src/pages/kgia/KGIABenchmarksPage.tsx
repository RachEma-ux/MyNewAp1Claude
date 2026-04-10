import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Play, Loader2, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";

interface BenchmarksProps {
  workspaceId: number;
}

const CATEGORIES = [
  "direct_lookup",
  "multi_hop",
  "mixed_retrieval",
  "incomplete_knowledge",
  "temporal",
  "governance_block",
] as const;

export default function KGIABenchmarksPage({ workspaceId }: BenchmarksProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("direct_lookup");
  const [question, setQuestion] = useState("");
  const [expectedAnswer, setExpectedAnswer] = useState("");
  const [expectedMode, setExpectedMode] = useState<string>("");

  const casesQuery = trpc.modules.kgia.benchmarks.listCases.useQuery({ workspaceId });
  const runsQuery = trpc.modules.kgia.benchmarks.listRuns.useQuery({ workspaceId });
  const createCase = trpc.modules.kgia.benchmarks.createCase.useMutation();
  const runCase = trpc.modules.kgia.benchmarks.runCase.useMutation();

  const handleCreateCase = async () => {
    if (!name.trim() || !question.trim()) {
      toast.error("Name and question are required");
      return;
    }
    try {
      await createCase.mutateAsync({
        workspaceId,
        name: name.trim(),
        category: category as any,
        question: question.trim(),
        expectedAnswer: expectedAnswer.trim() || undefined,
        expectedMode: expectedMode || undefined,
      });
      toast.success("Benchmark case created");
      setDialogOpen(false);
      setName("");
      setQuestion("");
      setExpectedAnswer("");
      casesQuery.refetch();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleRunBenchmark = async (caseId: number) => {
    try {
      const result = await runCase.mutateAsync({ workspaceId, caseId });
      if (result.passed) {
        toast.success(`Benchmark passed (score: ${(result.score * 100).toFixed(0)}%)`);
      } else {
        toast.warning(`Benchmark failed (score: ${(result.score * 100).toFixed(0)}%)`);
      }
      runsQuery.refetch();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const cases = casesQuery.data ?? [];
  const runs = runsQuery.data ?? [];

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Benchmark Lab</h3>
          <p className="text-sm text-muted-foreground">
            Create and run benchmark cases to evaluate KGIA performance
          </p>
        </div>
      </div>

      <Tabs defaultValue="cases">
        <TabsList>
          <TabsTrigger value="cases">Cases ({cases.length})</TabsTrigger>
          <TabsTrigger value="runs">Runs ({runs.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="cases" className="mt-3">
          <div className="flex justify-end mb-3">
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="w-4 h-4 mr-1" /> Add Case
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Benchmark Case</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium">Name</label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Direct lookup: CEO of Acme" />
                  </div>
                  <div>
                    <label className="text-xs font-medium">Category</label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-medium">Question</label>
                    <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Who is the CEO of Acme Corp?" />
                  </div>
                  <div>
                    <label className="text-xs font-medium">Expected Answer (optional)</label>
                    <Input value={expectedAnswer} onChange={(e) => setExpectedAnswer(e.target.value)} placeholder="John Smith" />
                  </div>
                  <div>
                    <label className="text-xs font-medium">Expected Mode (optional)</label>
                    <Select value={expectedMode} onValueChange={setExpectedMode}>
                      <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Any</SelectItem>
                        <SelectItem value="direct_query">Direct Query</SelectItem>
                        <SelectItem value="hybrid">Hybrid</SelectItem>
                        <SelectItem value="graph_rag">Graph RAG</SelectItem>
                        <SelectItem value="memory">Memory</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleCreateCase} disabled={createCase.isPending} className="w-full">
                    {createCase.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                    Create Case
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Question</TableHead>
                    <TableHead>Expected Mode</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cases.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        No benchmark cases. Create one to evaluate KGIA.
                      </TableCell>
                    </TableRow>
                  )}
                  {cases.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">{c.category.replace(/_/g, " ")}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-64 truncate">
                        {c.question}
                      </TableCell>
                      <TableCell className="text-xs">
                        {c.expectedMode ? c.expectedMode.replace(/_/g, " ") : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleRunBenchmark(c.id)}
                          disabled={runCase.isPending}
                          title="Run benchmark"
                        >
                          {runCase.isPending ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Play className="w-3.5 h-3.5" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="runs" className="mt-3">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Result</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        No benchmark runs yet
                      </TableCell>
                    </TableRow>
                  )}
                  {runs.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        {r.passed ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-500" />
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={r.score && r.score >= 0.7 ? "default" : r.score && r.score >= 0.4 ? "secondary" : "destructive"}
                          className="text-[10px]"
                        >
                          {r.score !== null ? `${(r.score * 100).toFixed(0)}%` : "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{r.actualMode?.replace(/_/g, " ") ?? "—"}</TableCell>
                      <TableCell className="text-xs">{r.durationMs ? `${r.durationMs}ms` : "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-64 truncate">
                        {r.notes ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
