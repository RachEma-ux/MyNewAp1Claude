/**
 * WS Wizard — Staged workspace creation flow
 *
 * Manager stages: Identity → Purpose → Actors → Activities → Needs → save as draft
 * Admin stage: Configuration → save as ready_for_review
 * Governance: Review → Approve/Reject → Publish → Activate
 */

import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
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
  Workflow,
  AlertCircle,
  Lock,
} from "lucide-react";
import { CatalogAgentSelect, CatalogBotSelect } from "@/components/catalog-selectors";
import { useCatalogAvailableAgents, useCatalogAvailableBots } from "@/hooks/useCatalogAvailable";

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

type CrewParticipantType = "agent" | "bot";
type CrewRole = "executor" | "analyst" | "reviewer" | "monitor" | "coordinator" | "advisor";

const CREW_ROLES: { value: CrewRole; label: string }[] = [
  { value: "executor", label: "Executor" },
  { value: "analyst", label: "Analyst" },
  { value: "reviewer", label: "Reviewer" },
  { value: "monitor", label: "Monitor" },
  { value: "coordinator", label: "Coordinator" },
  { value: "advisor", label: "Advisor" },
];

interface CrewEntry {
  participantType: CrewParticipantType;
  participantId: string;
  participantName: string;
  crewRole: CrewRole;
  note: string;
}

interface WizardData {
  name: string;
  description: string;
  type: string;
  purposeType: string;
  purposeRef: string;
  teamMembers: string[];
  crewAgents: CrewEntry[];
  activities: string[];
  needs: string[];
  embeddingModel: string;
  chunkingStrategy: string;
}

export default function WSWizardPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const visibleStages = useMemo<WizardStage[]>(
    () => isAdmin ? ALL_STAGES : MANAGER_STAGES,
    [isAdmin]
  );
  const [currentStage, setCurrentStage] = useState<WizardStage>("identity");
  const [draftId, setDraftId] = useState<number | null>(null);
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
  const [newCrewType, setNewCrewType] = useState<CrewParticipantType>("agent");
  const [newCrewId, setNewCrewId] = useState("");
  const [newCrewName, setNewCrewName] = useState("");
  const [newCrewRole, setNewCrewRole] = useState<CrewRole>("executor");
  const [newCrewNote, setNewCrewNote] = useState("");

  const { options: agentOptions } = useCatalogAvailableAgents();
  const { options: botOptions } = useCatalogAvailableBots();

  const handleCrewSelect = (id: string) => {
    setNewCrewId(id);
    const opts = newCrewType === "agent" ? agentOptions : botOptions;
    const match = opts.find((o) => String(o.id) === id);
    setNewCrewName(match?.label || "");
  };

  const buildCrewPayload = () =>
    data.crewAgents.length > 0
      ? data.crewAgents.map((c) => ({
          participantType: c.participantType as "agent" | "bot",
          participantId: Number(c.participantId) || 0,
          participantName: c.participantName,
          role: c.crewRole,
          note: c.note || undefined,
        }))
      : undefined;

  const createMutation = trpc.workspaces.createDraft.useMutation({
    onSuccess: (ws: any) => {
      setDraftId(ws.id);
      toast.success("Draft saved");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.workspaces.updateDraft.useMutation({
    onSuccess: () => {
      toast.success("Draft saved");
    },
    onError: (err) => toast.error(err.message),
  });

  const createAndSubmitMutation = trpc.workspaces.createDraft.useMutation({
    onSuccess: (ws: any) => {
      setDraftId(ws.id);
      toast.success("Workspace submitted for review");
      navigate(`/ws/list`);
    },
    onError: (err) => toast.error(err.message),
  });

  const submitForReviewMutation = trpc.workspaces.submitForReview.useMutation({
    onSuccess: () => {
      toast.success("Workspace submitted for review");
      navigate(`/ws/list`);
    },
    onError: (err) => toast.error(err.message),
  });

  const isSaving = createMutation.isPending || updateMutation.isPending
    || createAndSubmitMutation.isPending || submitForReviewMutation.isPending;

  const currentIndex = visibleStages.indexOf(currentStage);
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === visibleStages.length - 1;

  const goNext = () => {
    if (currentIndex < visibleStages.length - 1) {
      setCurrentStage(visibleStages[currentIndex + 1]);
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) {
      setCurrentStage(visibleStages[currentIndex - 1]);
    }
  };

  const saveDraft = () => {
    if (!data.name.trim()) {
      toast.error("Workspace name is required");
      return;
    }
    if (draftId) {
      // Update existing draft
      updateMutation.mutate({
        id: draftId,
        name: data.name,
        description: data.description,
        type: data.type,
        purposeType: data.purposeType as any,
        purposeRef: data.purposeRef,
        embeddingModel: data.embeddingModel,
        chunkingStrategy: data.chunkingStrategy as any,
        crew: buildCrewPayload(),
      });
    } else {
      // Create new draft
      createMutation.mutate({
        name: data.name,
        description: data.description,
        type: data.type,
        purposeType: data.purposeType as any,
        purposeRef: data.purposeRef,
        crew: buildCrewPayload(),
      });
    }
  };

  const saveAndSubmitForReview = () => {
    if (!data.name.trim()) {
      toast.error("Workspace name is required");
      return;
    }
    if (draftId) {
      // Update existing draft then submit for review
      updateMutation.mutate({
        id: draftId,
        name: data.name,
        description: data.description,
        type: data.type,
        purposeType: data.purposeType as any,
        purposeRef: data.purposeRef,
        embeddingModel: data.embeddingModel,
        chunkingStrategy: data.chunkingStrategy as any,
        crew: buildCrewPayload(),
      }, {
        onSuccess: () => {
          submitForReviewMutation.mutate({ id: draftId! });
        },
      });
    } else {
      // Create draft and submit in one action
      createAndSubmitMutation.mutate({
        name: data.name,
        description: data.description,
        type: data.type,
        purposeType: data.purposeType as any,
        purposeRef: data.purposeRef,
        crew: buildCrewPayload(),
        submitForReview: true,
      });
    }
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
        {visibleStages.map((stage, i) => {
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
        {/* Show locked admin/governance stages to non-admin users */}
        {!isAdmin && [...ADMIN_STAGES, ...GOVERNANCE_STAGES].map((stage) => (
          <span
            key={stage}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap bg-muted/50 text-muted-foreground/50 cursor-not-allowed"
            title={`${STAGE_LABELS[stage]} — Admin only`}
          >
            <Lock className="h-3 w-3" />
            {STAGE_LABELS[stage]}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-2 mb-4">
        <Badge variant="outline">{getStagePhase(currentStage)} Phase</Badge>
        <span className="text-sm text-muted-foreground">
          Step {currentIndex + 1} of {visibleStages.length}
          {!isAdmin && <span className="text-muted-foreground/60"> (Manager)</span>}
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
                <p className="text-xs text-muted-foreground mb-3">
                  Select AI participants from your governed catalog. Only Agents and Bots that have been approved and activated in AI Types are available.
                </p>

                {/* Step 1: Participant Type */}
                <div className="space-y-3 rounded-md border p-3 mb-3">
                  <div>
                    <label className="text-xs font-medium mb-1 block">AI Participant Type</label>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={newCrewType === "agent" ? "default" : "outline"}
                        onClick={() => { setNewCrewType("agent"); setNewCrewId(""); setNewCrewName(""); }}
                      >
                        <Workflow className="h-3 w-3 mr-1" /> Agent
                      </Button>
                      <Button
                        size="sm"
                        variant={newCrewType === "bot" ? "default" : "outline"}
                        onClick={() => { setNewCrewType("bot"); setNewCrewId(""); setNewCrewName(""); }}
                      >
                        <Bot className="h-3 w-3 mr-1" /> Bot
                      </Button>
                    </div>
                  </div>

                  {/* Step 2: Catalog-backed selection */}
                  <div>
                    <label className="text-xs font-medium mb-1 block">
                      {newCrewType === "agent" ? "Select Agent" : "Select Bot"}
                    </label>
                    {newCrewType === "agent" ? (
                      <CatalogAgentSelect
                        value={newCrewId}
                        onValueChange={handleCrewSelect}
                        searchable
                      />
                    ) : (
                      <CatalogBotSelect
                        value={newCrewId}
                        onValueChange={handleCrewSelect}
                        searchable
                      />
                    )}
                  </div>

                  {/* Step 3: Crew Role */}
                  <div>
                    <label className="text-xs font-medium mb-1 block">Crew Role</label>
                    <Select value={newCrewRole} onValueChange={(v) => setNewCrewRole(v as CrewRole)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CREW_ROLES.map((r) => (
                          <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Step 4: Optional note */}
                  <div>
                    <label className="text-xs font-medium mb-1 block">Mission Note (optional)</label>
                    <Input
                      value={newCrewNote}
                      onChange={(e) => setNewCrewNote(e.target.value)}
                      placeholder="e.g., Handle code review for PRs"
                    />
                  </div>

                  <Button
                    size="sm"
                    onClick={() => {
                      if (!newCrewId) {
                        toast.error(`Select ${newCrewType === "agent" ? "an Agent" : "a Bot"} from the catalog`);
                        return;
                      }
                      if (data.crewAgents.some((c) => c.participantId === newCrewId && c.participantType === newCrewType)) {
                        toast.error("This participant is already in the crew");
                        return;
                      }
                      setData({
                        ...data,
                        crewAgents: [...data.crewAgents, {
                          participantType: newCrewType,
                          participantId: newCrewId,
                          participantName: newCrewName,
                          crewRole: newCrewRole,
                          note: newCrewNote,
                        }],
                      });
                      setNewCrewId("");
                      setNewCrewName("");
                      setNewCrewRole("executor");
                      setNewCrewNote("");
                    }}
                  >
                    Add to Crew
                  </Button>
                </div>

                {/* Crew list */}
                {data.crewAgents.length === 0 ? (
                  <div className="flex items-start gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>
                      No AI participants added yet. Select an Agent or Bot from your catalog above.
                      If none are available, first add and approve them in AI Types / Catalog.
                    </span>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {data.crewAgents.map((entry, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm py-1.5 px-2 rounded hover:bg-muted/50">
                        {entry.participantType === "agent" ? (
                          <Workflow className="h-3 w-3 text-muted-foreground shrink-0" />
                        ) : (
                          <Bot className="h-3 w-3 text-muted-foreground shrink-0" />
                        )}
                        <span className="truncate">{entry.participantName || `#${entry.participantId}`}</span>
                        <Badge variant="outline" className="text-[10px]">{entry.participantType}</Badge>
                        <Badge variant="secondary" className="text-[10px]">{entry.crewRole}</Badge>
                        {entry.note && (
                          <span className="text-xs text-muted-foreground truncate max-w-[120px]" title={entry.note}>
                            {entry.note}
                          </span>
                        )}
                        <button
                          className="text-xs text-destructive ml-auto shrink-0"
                          onClick={() => setData({ ...data, crewAgents: data.crewAgents.filter((_, j) => j !== i) })}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
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

          {/* Configuration Stage (Admin only) */}
          {currentStage === "configuration" && isAdmin && (
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

          {/* Review Stage (Admin only — Governance) */}
          {currentStage === "review" && isAdmin && (
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
                  <span className="text-muted-foreground block mb-1">Crew:</span>
                  <div className="space-y-1 ml-2">
                    {data.crewAgents.map((a, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-xs">
                        {a.participantType === "agent" ? <Workflow className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                        <span>{a.participantName || `#${a.participantId}`}</span>
                        <Badge variant="outline" className="text-[10px]">{a.participantType}</Badge>
                        <Badge variant="secondary" className="text-[10px]">{a.crewRole}</Badge>
                        {a.note && <span className="text-muted-foreground">— {a.note}</span>}
                      </div>
                    ))}
                  </div>
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

      {/* Navigation — Previous | Save as Draft | Right action */}
      {/* Right action is mutually exclusive: Next OR Submit for Review OR empty */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={goPrev} disabled={isFirst}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Previous
        </Button>
        <Button variant="outline" onClick={saveDraft} disabled={isSaving}>
          <Save className="h-4 w-4 mr-1" /> {isSaving ? "Saving..." : "Save as Draft"}
        </Button>
        {isLast && isAdmin ? (
          <Button onClick={saveAndSubmitForReview} disabled={isSaving}>
            <Shield className="h-4 w-4 mr-1" /> Save & Submit for Review
          </Button>
        ) : isLast ? (
          <Button variant="outline" disabled className="invisible">
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button onClick={goNext}>
            Next <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        )}
      </div>
    </PageShell>
  );
}
