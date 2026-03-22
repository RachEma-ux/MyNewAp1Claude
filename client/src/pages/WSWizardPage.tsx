/**
 * WS Wizard — Staged workspace creation flow
 *
 * Manager stages: Identity → Purpose → Actors → Activities → Needs → save as draft
 * Admin stage: Configuration → save as ready_for_review
 * Governance: Review → Approve/Reject → Publish → Activate
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { PageShell } from "@/components/app";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Save,
  Target,
  Users,
  Bot,
  Briefcase,
  Settings,
  Shield,
  Sparkles,
} from "lucide-react";

type WizardStage =
  | "identity"
  | "purpose"
  | "actors"
  | "activities"
  | "needs"
  | "configuration"
  | "review";

const MANAGER_STAGES: WizardStage[] = ["identity", "purpose", "actors", "activities", "needs"];
const ADMIN_STAGES: WizardStage[] = ["configuration"];
const GOVERNANCE_STAGES: WizardStage[] = ["review"];
const ALL_STAGES: WizardStage[] = [...MANAGER_STAGES, ...ADMIN_STAGES, ...GOVERNANCE_STAGES];

const STAGE_LABELS: Record<WizardStage, string> = {
  identity: "Identity",
  purpose: "Purpose",
  actors: "Actors",
  activities: "Activities",
  needs: "Needs",
  configuration: "Configuration",
  review: "Review",
};

const STAGE_ICONS: Record<WizardStage, React.ReactNode> = {
  identity: <Sparkles className="h-4 w-4" />,
  purpose: <Target className="h-4 w-4" />,
  actors: <Users className="h-4 w-4" />,
  activities: <Briefcase className="h-4 w-4" />,
  needs: <Settings className="h-4 w-4" />,
  configuration: <Settings className="h-4 w-4" />,
  review: <Shield className="h-4 w-4" />,
};

interface WizardData {
  name: string;
  description: string;
  type: string;
  purposeType: string;
  purposeRef: string;
  teamMembers: string[];
  crewAgents: { name: string; role: string }[];
  activities: string[];
  needs: string[];
  embeddingModel: string;
  chunkingStrategy: string;
}

export default function WSWizardPage() {
  const [, navigate] = useLocation();
  const [currentStage, setCurrentStage] = useState<WizardStage>("identity");
  const [data, setData] = useState<WizardData>({
    name: "",
    description: "",
    type: "team",
    purposeType: "project",
    purposeRef: "",
    teamMembers: [],
    crewAgents: [],
    activities: [],
    needs: [],
    embeddingModel: "bge-small-en-v1.5",
    chunkingStrategy: "semantic",
  });
  const [newActivity, setNewActivity] = useState("");
  const [newNeed, setNewNeed] = useState("");
  const [newCrewName, setNewCrewName] = useState("");
  const [newCrewRole, setNewCrewRole] = useState("executor");

  const createMutation = trpc.workspaces.createDraft.useMutation({
    onSuccess: (ws: any) => {
      toast.success("Workspace draft created");
      navigate(`/ws/list`);
    },
    onError: (err) => toast.error(err.message),
  });

  const currentIndex = ALL_STAGES.indexOf(currentStage);
  const isFirst = currentIndex === 0;
  const isManagerDone = currentStage === "needs";
  const isLast = currentIndex === ALL_STAGES.length - 1;

  const goNext = () => {
    if (currentIndex < ALL_STAGES.length - 1) {
      setCurrentStage(ALL_STAGES[currentIndex + 1]);
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) {
      setCurrentStage(ALL_STAGES[currentIndex - 1]);
    }
  };

  const saveDraft = () => {
    if (!data.name.trim()) {
      toast.error("Workspace name is required");
      return;
    }
    createMutation.mutate({
      name: data.name,
      description: data.description,
      type: data.type,
      purposeType: data.purposeType as any,
      purposeRef: data.purposeRef,
    });
  };

  const getStagePhase = (stage: WizardStage): string => {
    if (MANAGER_STAGES.includes(stage)) return "Manager";
    if (ADMIN_STAGES.includes(stage)) return "Admin";
    return "Governance";
  };

  return (
    <PageShell title="Workspace Wizard" subtitle="Create a new workspace through the guided flow">
      {/* Progress bar */}
      <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-2">
        {ALL_STAGES.map((stage, i) => {
          const isActive = stage === currentStage;
          const isPast = i < currentIndex;
          return (
            <button
              key={stage}
              onClick={() => setCurrentStage(stage)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : isPast
                  ? "bg-primary/20 text-primary"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {isPast ? <Check className="h-3 w-3" /> : STAGE_ICONS[stage]}
              {STAGE_LABELS[stage]}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2 mb-4">
        <Badge variant="outline">{getStagePhase(currentStage)} Phase</Badge>
        <span className="text-sm text-muted-foreground">
          Step {currentIndex + 1} of {ALL_STAGES.length}
        </span>
      </div>

      {/* Stage content */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {STAGE_ICONS[currentStage]}
            {STAGE_LABELS[currentStage]}
          </CardTitle>
          <CardDescription>
            {currentStage === "identity" && "Define the workspace identity — name, description, type."}
            {currentStage === "purpose" && "What is this workspace for? Define its purpose."}
            {currentStage === "actors" && "Who will participate? Define team members and AI crew."}
            {currentStage === "activities" && "What activities will take place in this workspace?"}
            {currentStage === "needs" && "What resources and tools does this workspace need?"}
            {currentStage === "configuration" && "Administrative configuration for governance readiness."}
            {currentStage === "review" && "Review the workspace definition before submission."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Identity Stage */}
          {currentStage === "identity" && (
            <>
              <div>
                <label className="text-sm font-medium mb-1 block">Workspace Name *</label>
                <Input
                  value={data.name}
                  onChange={(e) => setData({ ...data, name: e.target.value })}
                  placeholder="My Workspace"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Description</label>
                <Textarea
                  value={data.description}
                  onChange={(e) => setData({ ...data, description: e.target.value })}
                  placeholder="What is this workspace about?"
                  rows={3}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Workspace Type</label>
                <Select value={data.type} onValueChange={(v) => setData({ ...data, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="personal">Personal</SelectItem>
                    <SelectItem value="project">Project</SelectItem>
                    <SelectItem value="research">Research</SelectItem>
                    <SelectItem value="team">Team</SelectItem>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
                    <SelectItem value="sandbox">Sandbox</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* Purpose Stage */}
          {currentStage === "purpose" && (
            <>
              <div>
                <label className="text-sm font-medium mb-1 block">Purpose Type</label>
                <Select value={data.purposeType} onValueChange={(v) => setData({ ...data, purposeType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="goal">Goal</SelectItem>
                    <SelectItem value="mission">Mission</SelectItem>
                    <SelectItem value="project">Project</SelectItem>
                    <SelectItem value="team">Team Activity</SelectItem>
                    <SelectItem value="strategy">Strategy</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Purpose Reference</label>
                <Input
                  value={data.purposeRef}
                  onChange={(e) => setData({ ...data, purposeRef: e.target.value })}
                  placeholder="e.g., project name, goal description, mission statement"
                />
              </div>
            </>
          )}

          {/* Actors Stage */}
          {currentStage === "actors" && (
            <>
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
                  <Users className="h-4 w-4" /> Team (Human Participants)
                </h4>
                <p className="text-xs text-muted-foreground mb-2">
                  Team members can be added after workspace creation from the workspace shell.
                </p>
              </div>
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
                  <Bot className="h-4 w-4" /> Crew (AI Participants)
                </h4>
                <div className="flex gap-2 mb-2">
                  <Input
                    value={newCrewName}
                    onChange={(e) => setNewCrewName(e.target.value)}
                    placeholder="Agent name"
                    className="flex-1"
                  />
                  <Select value={newCrewRole} onValueChange={setNewCrewRole}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="executor">Executor</SelectItem>
                      <SelectItem value="advisor">Advisor</SelectItem>
                      <SelectItem value="monitor">Monitor</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (newCrewName.trim()) {
                        setData({ ...data, crewAgents: [...data.crewAgents, { name: newCrewName, role: newCrewRole }] });
                        setNewCrewName("");
                      }
                    }}
                  >
                    Add
                  </Button>
                </div>
                {data.crewAgents.map((agent, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm py-1">
                    <Bot className="h-3 w-3 text-muted-foreground" />
                    <span>{agent.name}</span>
                    <Badge variant="secondary" className="text-xs">{agent.role}</Badge>
                    <button
                      className="text-xs text-destructive ml-auto"
                      onClick={() => setData({ ...data, crewAgents: data.crewAgents.filter((_, j) => j !== i) })}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Activities Stage */}
          {currentStage === "activities" && (
            <>
              <div>
                <label className="text-sm font-medium mb-1 block">Planned Activities</label>
                <div className="flex gap-2 mb-2">
                  <Input
                    value={newActivity}
                    onChange={(e) => setNewActivity(e.target.value)}
                    placeholder="e.g., Document analysis, Code review, Research"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newActivity.trim()) {
                        setData({ ...data, activities: [...data.activities, newActivity.trim()] });
                        setNewActivity("");
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (newActivity.trim()) {
                        setData({ ...data, activities: [...data.activities, newActivity.trim()] });
                        setNewActivity("");
                      }
                    }}
                  >
                    Add
                  </Button>
                </div>
                {data.activities.map((act, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm py-1">
                    <Briefcase className="h-3 w-3 text-muted-foreground" />
                    <span>{act}</span>
                    <button
                      className="text-xs text-destructive ml-auto"
                      onClick={() => setData({ ...data, activities: data.activities.filter((_, j) => j !== i) })}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Needs Stage */}
          {currentStage === "needs" && (
            <>
              <div>
                <label className="text-sm font-medium mb-1 block">Resource & Tool Needs</label>
                <div className="flex gap-2 mb-2">
                  <Input
                    value={newNeed}
                    onChange={(e) => setNewNeed(e.target.value)}
                    placeholder="e.g., Vector DB, LLM Provider, Document Storage"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newNeed.trim()) {
                        setData({ ...data, needs: [...data.needs, newNeed.trim()] });
                        setNewNeed("");
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (newNeed.trim()) {
                        setData({ ...data, needs: [...data.needs, newNeed.trim()] });
                        setNewNeed("");
                      }
                    }}
                  >
                    Add
                  </Button>
                </div>
                {data.needs.map((need, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm py-1">
                    <Settings className="h-3 w-3 text-muted-foreground" />
                    <span>{need}</span>
                    <button
                      className="text-xs text-destructive ml-auto"
                      onClick={() => setData({ ...data, needs: data.needs.filter((_, j) => j !== i) })}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Configuration Stage (Admin) */}
          {currentStage === "configuration" && (
            <>
              <div>
                <label className="text-sm font-medium mb-1 block">Embedding Model</label>
                <Select value={data.embeddingModel} onValueChange={(v) => setData({ ...data, embeddingModel: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bge-small-en-v1.5">BGE Small EN v1.5</SelectItem>
                    <SelectItem value="bge-base-en-v1.5">BGE Base EN v1.5</SelectItem>
                    <SelectItem value="all-MiniLM-L6-v2">All-MiniLM-L6-v2</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Chunking Strategy</label>
                <Select value={data.chunkingStrategy} onValueChange={(v) => setData({ ...data, chunkingStrategy: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="semantic">Semantic</SelectItem>
                    <SelectItem value="fixed">Fixed Size</SelectItem>
                    <SelectItem value="recursive">Recursive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* Review Stage (Governance) */}
          {currentStage === "review" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Name:</span> {data.name || "—"}</div>
                <div><span className="text-muted-foreground">Type:</span> {data.type}</div>
                <div><span className="text-muted-foreground">Purpose:</span> {data.purposeType}</div>
                <div><span className="text-muted-foreground">Ref:</span> {data.purposeRef || "—"}</div>
              </div>
              {data.description && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Description:</span> {data.description}
                </div>
              )}
              {data.crewAgents.length > 0 && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Crew:</span>{" "}
                  {data.crewAgents.map((a) => `${a.name} (${a.role})`).join(", ")}
                </div>
              )}
              {data.activities.length > 0 && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Activities:</span>{" "}
                  {data.activities.join(", ")}
                </div>
              )}
              {data.needs.length > 0 && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Needs:</span>{" "}
                  {data.needs.join(", ")}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={goPrev} disabled={isFirst}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Previous
        </Button>
        <div className="flex gap-2">
          {isManagerDone && (
            <Button variant="secondary" onClick={saveDraft}>
              <Save className="h-4 w-4 mr-1" /> Save as Draft
            </Button>
          )}
          {!isLast && (
            <Button onClick={goNext}>
              Next <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          )}
          {isLast && (
            <Button onClick={saveDraft} disabled={createMutation.isPending}>
              <Check className="h-4 w-4 mr-1" /> Create Workspace
            </Button>
          )}
        </div>
      </div>
    </PageShell>
  );
}
