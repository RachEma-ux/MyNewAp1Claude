/**
 * PMT AI Services — AI-powered project management assistant
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Brain, Sparkles, BarChart3, Users, Wand2 } from "lucide-react";
import { toast } from "sonner";

export function PMTAIServicesPage({ workspaceId }: { workspaceId: number }) {
  const [taskDesc, setTaskDesc] = useState("");
  const [triageTitle, setTriageTitle] = useState("");
  const [triageDesc, setTriageDesc] = useState("");
  const [selectedProject, setSelectedProject] = useState("");
  const [selectedSprint, setSelectedSprint] = useState("");
  const [suggestions, setSuggestions] = useState<any[] | null>(null);
  const [triageResult, setTriageResult] = useState<any | null>(null);
  const [statusReport, setStatusReport] = useState<string | null>(null);
  const [workloadResult, setWorkloadResult] = useState<any | null>(null);

  const { data: projects } = trpc.modules.pmt.projects.list.useQuery({ workspaceId });

  const suggestMut = trpc.modules.pmt.ai.suggestTasks.useMutation({
    onSuccess: (data) => {
      setSuggestions(data as any[]);
      toast.success(`Generated ${(data as any[]).length} task suggestions`);
    },
    onError: (e) => toast.error(e.message),
  });

  const { refetch: fetchTriage, isFetching: triageFetching } = trpc.modules.pmt.ai.triageWorkItem.useQuery(
    { workspaceId, title: triageTitle, description: triageDesc },
    { enabled: false }
  );

  const { refetch: fetchReport, isFetching: reportFetching } = trpc.modules.pmt.ai.generateStatusReport.useQuery(
    { workspaceId, sprintId: parseInt(selectedSprint) || 0 },
    { enabled: false }
  );

  const { refetch: fetchWorkload, isFetching: workloadFetching } = trpc.modules.pmt.ai.suggestWorkloadBalance.useQuery(
    { workspaceId },
    { enabled: false }
  );

  const handleSuggest = () => {
    if (!taskDesc.trim() || !selectedProject) {
      toast.error("Enter a description and select a project");
      return;
    }
    suggestMut.mutate({ workspaceId, projectId: parseInt(selectedProject), description: taskDesc });
  };

  const handleTriage = async () => {
    if (!triageTitle.trim()) { toast.error("Enter a title"); return; }
    const { data } = await fetchTriage();
    if (data) setTriageResult(data);
  };

  const handleReport = async () => {
    if (!selectedSprint) { toast.error("Select a sprint"); return; }
    const { data } = await fetchReport();
    if (data) setStatusReport(data as string);
  };

  const handleWorkload = async () => {
    const { data } = await fetchWorkload();
    if (data) setWorkloadResult(data);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Brain className="h-6 w-6" />
          AI Services
        </h1>
        <Badge variant="secondary" className="text-xs">AI-Powered</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Task Suggestions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-yellow-500" />
              AI Task Suggestions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label className="text-xs">Project</Label>
              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  {projects?.map((p: any) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Project Description</Label>
              <Textarea
                value={taskDesc}
                onChange={(e) => setTaskDesc(e.target.value)}
                rows={4}
                placeholder="Describe the project goals and features..."
                className="text-xs"
              />
            </div>
            <Button size="sm" onClick={handleSuggest} disabled={suggestMut.isPending} className="w-full">
              {suggestMut.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Wand2 className="h-3 w-3 mr-1" />}
              Generate Tasks
            </Button>
            {suggestions && (
              <div className="border rounded-md p-2 space-y-1 max-h-60 overflow-y-auto">
                {suggestions.map((s: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs p-1 rounded hover:bg-accent">
                    <span className="truncate flex-1">{s.title}</span>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <Badge variant="outline" className="text-[9px]">{s.type}</Badge>
                      <Badge variant="secondary" className="text-[9px]">{s.priority}</Badge>
                      <span className="text-muted-foreground">{s.estimatedHours}h</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* AI Triage */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-blue-500" />
              AI Triage
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label className="text-xs">Title</Label>
              <Input
                value={triageTitle}
                onChange={(e) => setTriageTitle(e.target.value)}
                placeholder="Work item title"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Description</Label>
              <Textarea
                value={triageDesc}
                onChange={(e) => setTriageDesc(e.target.value)}
                rows={3}
                placeholder="Optional description..."
                className="text-xs"
              />
            </div>
            <Button size="sm" onClick={handleTriage} disabled={triageFetching} className="w-full">
              {triageFetching ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Wand2 className="h-3 w-3 mr-1" />}
              Auto-Classify
            </Button>
            {triageResult && (
              <div className="border rounded-md p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Type:</span>
                  <Badge variant="outline" className="text-[10px]">{triageResult.type}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Priority:</span>
                  <Badge variant="secondary" className="text-[10px]">{triageResult.priority}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Labels:</span>
                  {triageResult.labels?.map((l: string) => (
                    <Badge key={l} variant="outline" className="text-[9px]">{l}</Badge>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Confidence:</span>
                  <span className="text-xs font-medium">{(triageResult.confidence * 100).toFixed(0)}%</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Status Report */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-green-500" />
              AI Status Report
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label className="text-xs">Sprint ID</Label>
              <Input
                type="number"
                value={selectedSprint}
                onChange={(e) => setSelectedSprint(e.target.value)}
                placeholder="Enter sprint ID"
                className="h-8 text-xs"
              />
            </div>
            <Button size="sm" onClick={handleReport} disabled={reportFetching} className="w-full">
              {reportFetching ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <BarChart3 className="h-3 w-3 mr-1" />}
              Generate Report
            </Button>
            {statusReport && (
              <div className="border rounded-md p-3 text-xs whitespace-pre-wrap max-h-60 overflow-y-auto">
                {statusReport}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Workload Balance */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-purple-500" />
              AI Workload Balance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Analyze team workload distribution and get rebalancing suggestions.
            </p>
            <Button size="sm" onClick={handleWorkload} disabled={workloadFetching} className="w-full">
              {workloadFetching ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Users className="h-3 w-3 mr-1" />}
              Analyze Workload
            </Button>
            {workloadResult && (
              <div className="border rounded-md p-3 space-y-2">
                {workloadResult.overloaded?.length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-red-600">Overloaded:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {workloadResult.overloaded.map((n: string) => (
                        <Badge key={n} variant="destructive" className="text-[9px]">{n}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {workloadResult.underloaded?.length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-green-600">Available Capacity:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {workloadResult.underloaded.map((n: string) => (
                        <Badge key={n} variant="secondary" className="text-[9px]">{n}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                <div className="space-y-1 mt-2">
                  {workloadResult.suggestions?.map((s: string, i: number) => (
                    <p key={i} className="text-xs text-muted-foreground">• {s}</p>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
