import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, Plus, Workflow, Trash2, FileStack, ArrowLeft, ArrowRight, Eye } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  draft: "text-zinc-500 border-zinc-500/30",
  queued: "text-blue-500 border-blue-500/30",
  preparing_workspace: "text-cyan-500 border-cyan-500/30",
  starting_session: "text-cyan-500 border-cyan-500/30",
  planning: "text-indigo-500 border-indigo-500/30",
  awaiting_approval: "text-amber-500 border-amber-500/30",
  building: "text-violet-500 border-violet-500/30",
  reviewing: "text-orange-500 border-orange-500/30",
  testing: "text-teal-500 border-teal-500/30",
  governance_check: "text-purple-500 border-purple-500/30",
  completed: "text-green-500 border-green-500/30",
  failed: "text-red-500 border-red-500/30",
  cancelled: "text-zinc-400 border-zinc-400/30",
  archived: "text-zinc-300 border-zinc-300/30",
};

type DialogStep = "choose" | "blank" | "pick-template" | "fill-variables" | "preview";

export default function CodeStudioJobsPage() {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [objective, setObjective] = useState("");
  const [step, setStep] = useState<DialogStep>("choose");
  const [selectedTemplate, setSelectedTemplate] = useState<any | null>(null);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [generatedTitle, setGeneratedTitle] = useState("");
  const [generatedObjective, setGeneratedObjective] = useState("");
  const [generatedConstraints, setGeneratedConstraints] = useState<any>(undefined);

  const jobsQuery = trpc.codeStudio.jobs.list.useQuery({}, { refetchInterval: 5000 });
  const jobs = jobsQuery.data ?? [];

  const templatesQuery = trpc.codeStudio.templates.list.useQuery({});
  const templates = templatesQuery.data ?? [];

  const generateDraftQuery = trpc.codeStudio.templates.generateJobDraft.useQuery(
    { templateId: selectedTemplate?.id ?? 0, variables: variableValues },
    { enabled: false }
  );

  const createMutation = trpc.codeStudio.jobs.create.useMutation({
    onSuccess: (data: any) => {
      toast.success("Job created");
      resetDialog();
      jobsQuery.refetch();
      if (data?.id) navigate(`/code-studio/jobs/${data.id}`);
    },
    onError: () => toast.error("Failed to create job"),
  });

  const deleteMutation = trpc.codeStudio.jobs.delete.useMutation({
    onSuccess: () => { toast.success("Job deleted"); jobsQuery.refetch(); },
    onError: () => toast.error("Failed to delete job"),
  });

  const resetDialog = () => {
    setOpen(false);
    setStep("choose");
    setTitle("");
    setObjective("");
    setSelectedTemplate(null);
    setVariableValues({});
    setGeneratedTitle("");
    setGeneratedObjective("");
    setGeneratedConstraints(undefined);
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) resetDialog();
    else { setOpen(true); setStep("choose"); }
  };

  const handleSelectTemplate = (t: any) => {
    setSelectedTemplate(t);
    // Initialize variable values
    const varDefs = (t.variableSchema as any[]) || [];
    const initial: Record<string, string> = {};
    varDefs.forEach((v: any) => { initial[v.key] = ""; });
    setVariableValues(initial);
    setStep("fill-variables");
  };

  const handleGeneratePreview = async () => {
    if (!selectedTemplate) return;
    try {
      const result = await generateDraftQuery.refetch();
      if (result.data) {
        setGeneratedTitle(result.data.title);
        setGeneratedObjective(result.data.objective);
        setGeneratedConstraints(result.data.constraints);
        setStep("preview");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to generate preview");
    }
  };

  const handleCreateFromTemplate = () => {
    createMutation.mutate({
      title: generatedTitle.trim(),
      objective: generatedObjective.trim() || undefined,
      constraints: generatedConstraints,
    });
  };

  const handleCreateBlank = () => {
    createMutation.mutate({
      title: title.trim(),
      objective: objective.trim() || undefined,
    });
  };

  const varDefs = selectedTemplate ? ((selectedTemplate.variableSchema as any[]) || []) : [];
  const requiredFilled = varDefs.filter((v: any) => v.required).every((v: any) => variableValues[v.key]?.trim());

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Workflow className="h-4 w-4 text-violet-500" /> Coding Jobs
          {jobs.length > 0 && <Badge variant="secondary" className="text-[9px] px-1.5">{jobs.length}</Badge>}
        </h2>
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>
            <Button size="sm" className="text-xs"><Plus className="h-3 w-3 mr-1" /> New Job</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-sm">
                {step === "choose" && "Create Coding Job"}
                {step === "blank" && "New Blank Job"}
                {step === "pick-template" && "Choose Template"}
                {step === "fill-variables" && `Template: ${selectedTemplate?.name}`}
                {step === "preview" && "Review & Create"}
              </DialogTitle>
            </DialogHeader>

            {/* Step: Choose blank vs template */}
            {step === "choose" && (
              <div className="space-y-2">
                <Button variant="outline" className="w-full justify-start text-xs h-10 gap-2" onClick={() => setStep("blank")}>
                  <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                  <div className="text-left">
                    <div className="font-medium">Blank Job</div>
                    <div className="text-[9px] text-muted-foreground">Start from scratch with custom title & objective</div>
                  </div>
                </Button>
                <Button variant="outline" className="w-full justify-start text-xs h-10 gap-2"
                  onClick={() => setStep("pick-template")} disabled={templates.length === 0}>
                  <FileStack className="h-3.5 w-3.5 text-violet-500" />
                  <div className="text-left">
                    <div className="font-medium">Use Template</div>
                    <div className="text-[9px] text-muted-foreground">
                      {templates.length > 0 ? `${templates.length} template(s) available` : "No templates — create one first"}
                    </div>
                  </div>
                </Button>
              </div>
            )}

            {/* Step: Blank job form */}
            {step === "blank" && (
              <div className="space-y-3">
                <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1 -mt-1" onClick={() => setStep("choose")}>
                  <ArrowLeft className="h-3 w-3 mr-0.5" /> Back
                </Button>
                <Input className="h-8 text-xs" placeholder="Job title..." value={title} onChange={(e) => setTitle(e.target.value)} />
                <Textarea className="text-xs h-20 resize-none" placeholder="Coding objective..." value={objective} onChange={(e) => setObjective(e.target.value)} />
                <Button size="sm" className="w-full text-xs" disabled={!title.trim() || createMutation.isPending} onClick={handleCreateBlank}>
                  {createMutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Create
                </Button>
              </div>
            )}

            {/* Step: Pick template */}
            {step === "pick-template" && (
              <div className="space-y-2">
                <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1 -mt-1" onClick={() => setStep("choose")}>
                  <ArrowLeft className="h-3 w-3 mr-0.5" /> Back
                </Button>
                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                  {templates.map((t: any) => (
                    <button key={t.id}
                      className="w-full text-left p-2.5 rounded border hover:border-violet-500/30 hover:bg-violet-500/5 transition-colors"
                      onClick={() => handleSelectTemplate(t)}>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium">{t.name}</span>
                        {t.isBuiltIn && <Badge variant="secondary" className="text-[8px] px-1">Built-in</Badge>}
                        {t.category && <Badge variant="outline" className="text-[8px] px-1">{t.category}</Badge>}
                      </div>
                      {t.description && <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{t.description}</p>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step: Fill template variables */}
            {step === "fill-variables" && selectedTemplate && (
              <div className="space-y-3">
                <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1 -mt-1" onClick={() => setStep("pick-template")}>
                  <ArrowLeft className="h-3 w-3 mr-0.5" /> Back
                </Button>
                {selectedTemplate.description && (
                  <p className="text-[10px] text-muted-foreground bg-muted/30 p-2 rounded">{selectedTemplate.description}</p>
                )}
                <div className="space-y-2.5 max-h-[50vh] overflow-y-auto">
                  {varDefs.map((v: any) => (
                    <div key={v.key}>
                      <Label className="text-[10px] font-medium">
                        {v.label} {v.required && <span className="text-red-400">*</span>}
                      </Label>
                      {v.helpText && <p className="text-[9px] text-muted-foreground">{v.helpText}</p>}
                      {v.type === "long_text" ? (
                        <Textarea
                          className="text-xs h-24 resize-y mt-0.5"
                          placeholder={v.placeholder || ""}
                          value={variableValues[v.key] || ""}
                          onChange={(e) => setVariableValues({ ...variableValues, [v.key]: e.target.value })}
                        />
                      ) : (
                        <Input
                          className="h-7 text-xs mt-0.5"
                          placeholder={v.placeholder || ""}
                          value={variableValues[v.key] || ""}
                          onChange={(e) => setVariableValues({ ...variableValues, [v.key]: e.target.value })}
                        />
                      )}
                    </div>
                  ))}
                </div>
                <Button size="sm" className="w-full text-xs" disabled={!requiredFilled || generateDraftQuery.isFetching}
                  onClick={handleGeneratePreview}>
                  {generateDraftQuery.isFetching ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Eye className="h-3 w-3 mr-1" />}
                  Preview Job
                </Button>
              </div>
            )}

            {/* Step: Preview and create */}
            {step === "preview" && (
              <div className="space-y-3">
                <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1 -mt-1" onClick={() => setStep("fill-variables")}>
                  <ArrowLeft className="h-3 w-3 mr-0.5" /> Edit Variables
                </Button>
                <div>
                  <Label className="text-[10px]">Title</Label>
                  <Input className="h-7 text-xs" value={generatedTitle} onChange={(e) => setGeneratedTitle(e.target.value)} />
                </div>
                <div>
                  <Label className="text-[10px]">Objective / Prompt</Label>
                  <Textarea className="text-xs h-40 resize-y font-mono" value={generatedObjective}
                    onChange={(e) => setGeneratedObjective(e.target.value)} />
                </div>
                <p className="text-[9px] text-muted-foreground">You can edit the generated title and objective before creating.</p>
                <Button size="sm" className="w-full text-xs" disabled={!generatedTitle.trim() || createMutation.isPending}
                  onClick={handleCreateFromTemplate}>
                  {createMutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                  <ArrowRight className="h-3 w-3 mr-1" /> Create Job
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {jobsQuery.isLoading && <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin" /></div>}
      {!jobsQuery.isLoading && jobs.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-8">No coding jobs yet. Create one to get started.</p>
      )}
      <div className="space-y-2">
        {jobs.map((j: any) => (
          <Card key={j.id} className="hover:border-violet-500/30 transition-colors cursor-pointer"
            onClick={() => navigate(`/code-studio/jobs/${j.id}`)}>
            <CardContent className="p-3">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate">{j.title}</p>
                  {j.objective && <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">{j.objective}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <Badge variant="outline" className={`text-[9px] px-1 py-0 ${STATUS_COLORS[j.status] || ""}`}>
                    {j.status?.replace(/_/g, " ")}
                  </Badge>
                  <button title="Delete job" className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                    onClick={(e) => { e.stopPropagation(); if (confirm(`Delete job "${j.title}"?`)) deleteMutation.mutate({ id: j.id }); }}>
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-1.5 text-[9px] text-muted-foreground">
                <span>#{j.id}</span>
                {j.priority && <span className="uppercase">{j.priority}</span>}
                {j.createdAt && <span>{new Date(j.createdAt).toLocaleDateString()}</span>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
