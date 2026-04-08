/**
 * AI Agent Studio — Identity Page
 *
 * Edit name, internal key, description, owner, domain, tags, agent class,
 * visibility, lifecycle state, supported environments.
 */
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, IdCard } from "lucide-react";
import {
  PageHeader,
  LoadingState,
  SectionLabel,
} from "@/components/agent-studio/ui";

export default function AgentIdentityPage({ agentId }: { agentId: number }) {
  const utils = trpc.useUtils();
  const query = trpc.agentStudio.identity.get.useQuery({ agentId });
  const updateMut = trpc.agentStudio.identity.update.useMutation({
    onSuccess: () => {
      toast.success("Identity saved");
      utils.agentStudio.identity.get.invalidate({ agentId });
      utils.agentStudio.shell.getShellSummary.invalidate({ agentId });
      // Home table reads from agent core; invalidate so new name/state shows up
      utils.agentStudio.home.listAgents.invalidate();
      utils.agentStudio.home.getHomeSummary.invalidate();
      utils.agentStudio.home.getReviewQueue.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [domain, setDomain] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [agentClass, setAgentClass] = useState("assistant");
  const [visibility, setVisibility] = useState("private");
  const [lifecycleState, setLifecycleState] = useState("draft");

  useEffect(() => {
    if (query.data?.agent && query.data?.draft) {
      setName(query.data.agent.name);
      setDescription((query.data.draft.description ?? query.data.agent.description) ?? "");
      setDomain((query.data.draft.domain ?? query.data.agent.domain) ?? "");
      const tags: string[] = (query.data.draft.tags ?? query.data.agent.tags ?? []) as string[];
      setTagsInput(tags.join(", "));
      setAgentClass(query.data.agent.agentClass ?? "assistant");
      setVisibility(query.data.agent.visibility ?? "private");
      setLifecycleState(query.data.agent.lifecycleState);
    }
  }, [query.data]);

  if (query.isLoading) return <LoadingState label="Loading identity…" />;

  const handleSave = () => {
    updateMut.mutate({
      agentId,
      name,
      description,
      domain: domain || undefined,
      tags: tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      agentClass: agentClass as any,
      visibility: visibility as any,
      lifecycleState: lifecycleState as any,
    });
  };

  return (
    <div className="p-4 max-w-3xl space-y-4">
      <PageHeader
        title="Identity"
        subtitle="Core descriptors that identify and classify this agent"
        icon={<IdCard className="h-4 w-4" />}
      />

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-xs" />
            </Field>
            <Field label="Internal Key (immutable)">
              <Input value={query.data?.agent?.internalKey ?? ""} disabled className="h-8 text-xs font-mono" />
            </Field>
            <Field label="Domain / Business Area">
              <Input value={domain} onChange={(e) => setDomain(e.target.value)} className="h-8 text-xs" />
            </Field>
            <Field label="Tags (comma-separated)">
              <Input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} className="h-8 text-xs" />
            </Field>
            <Field label="Agent Class">
              <select
                value={agentClass}
                onChange={(e) => setAgentClass(e.target.value)}
                className="h-8 px-2 rounded border bg-background text-xs w-full"
              >
                <option value="assistant">Assistant</option>
                <option value="specialist">Specialist</option>
                <option value="orchestrator">Orchestrator</option>
                <option value="automation">Automation</option>
                <option value="researcher">Researcher</option>
                <option value="auditor">Auditor</option>
              </select>
            </Field>
            <Field label="Visibility">
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value)}
                className="h-8 px-2 rounded border bg-background text-xs w-full"
              >
                <option value="private">Private</option>
                <option value="team">Team</option>
                <option value="org">Org</option>
                <option value="public">Public</option>
              </select>
            </Field>
            <Field label="Lifecycle State">
              <select
                value={lifecycleState}
                onChange={(e) => setLifecycleState(e.target.value)}
                className="h-8 px-2 rounded border bg-background text-xs w-full"
              >
                <option value="new">New</option>
                <option value="draft">Draft</option>
                <option value="in_design">In Design</option>
                <option value="simulated">Simulated</option>
                <option value="tested">Tested</option>
                <option value="review_required">Review Required</option>
                <option value="blocked">Blocked</option>
                <option value="ready_to_publish">Ready to Publish</option>
                <option value="published">Published</option>
                <option value="deprecated">Deprecated</option>
                <option value="archived">Archived</option>
              </select>
            </Field>
          </div>

          <Field label="Description">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="text-xs min-h-[80px]"
            />
          </Field>

          <div className="flex justify-end">
            <Button size="sm" onClick={handleSave} disabled={updateMut.isPending}>
              {updateMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Save Identity
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground/70">{label}</Label>
      {children}
    </div>
  );
}
