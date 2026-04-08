/**
 * AI Agent Studio — Prompts Page
 *
 * System / role / policy instructions, output contract, examples, fallback,
 * refusal behavior. Modes: structured, raw, preview, diff.
 */
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, MessageSquare } from "lucide-react";
import { PageHeader, LoadingState } from "@/components/agent-studio/ui";

export default function AgentPromptsPage({ agentId }: { agentId: number }) {
  const utils = trpc.useUtils();
  const query = trpc.agentStudio.prompts.get.useQuery({ agentId });
  const previewQuery = trpc.agentStudio.prompts.assemblePreview.useQuery({ agentId });
  const updateMut = trpc.agentStudio.prompts.update.useMutation({
    onSuccess: () => {
      toast.success("Prompts saved");
      utils.agentStudio.prompts.get.invalidate({ agentId });
      utils.agentStudio.prompts.assemblePreview.invalidate({ agentId });
      utils.agentStudio.shell.getShellSummary.invalidate({ agentId });
    },
    onError: (e) => toast.error(e.message),
  });

  const [systemInstructions, setSystem] = useState("");
  const [roleInstructions, setRole] = useState("");
  const [policyInstructions, setPolicy] = useState("");
  const [outputContract, setOutput] = useState("");
  const [fallbackBehavior, setFallback] = useState("");
  const [refusalBehavior, setRefusal] = useState("");

  useEffect(() => {
    if (query.data) {
      const d = query.data as any;
      setSystem(d.systemInstructions ?? "");
      setRole(d.roleInstructions ?? "");
      setPolicy(d.policyInstructions ?? "");
      setOutput(d.outputContract ?? "");
      setFallback(d.fallbackBehavior ?? "");
      setRefusal(d.refusalBehavior ?? "");
    }
  }, [query.data]);

  if (query.isLoading) return <LoadingState label="Loading prompts…" />;

  const handleSave = () =>
    updateMut.mutate({
      agentId,
      systemInstructions,
      roleInstructions,
      policyInstructions,
      outputContract,
      fallbackBehavior,
      refusalBehavior,
    });

  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Prompt Pack"
        subtitle="System, role, policy, output contract, fallback, and refusal instructions"
        icon={<MessageSquare className="h-4 w-4" />}
      />

      <Tabs defaultValue="structured">
        <TabsList>
          <TabsTrigger value="structured">Structured</TabsTrigger>
          <TabsTrigger value="raw">Raw</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="diff">Diff</TabsTrigger>
        </TabsList>

        <TabsContent value="structured">
          <Card>
            <CardContent className="p-4 space-y-3">
              <Field label="System Instructions">
                <Textarea
                  value={systemInstructions}
                  onChange={(e) => setSystem(e.target.value)}
                  className="text-xs min-h-[100px] font-mono"
                />
              </Field>
              <Field label="Role Instructions">
                <Textarea
                  value={roleInstructions}
                  onChange={(e) => setRole(e.target.value)}
                  className="text-xs min-h-[80px] font-mono"
                />
              </Field>
              <Field label="Policy Instructions">
                <Textarea
                  value={policyInstructions}
                  onChange={(e) => setPolicy(e.target.value)}
                  className="text-xs min-h-[80px] font-mono"
                />
              </Field>
              <Field label="Output Contract">
                <Textarea
                  value={outputContract}
                  onChange={(e) => setOutput(e.target.value)}
                  className="text-xs min-h-[80px] font-mono"
                />
              </Field>
              <Field label="Fallback Behavior">
                <Textarea
                  value={fallbackBehavior}
                  onChange={(e) => setFallback(e.target.value)}
                  className="text-xs min-h-[60px] font-mono"
                />
              </Field>
              <Field label="Refusal Behavior">
                <Textarea
                  value={refusalBehavior}
                  onChange={(e) => setRefusal(e.target.value)}
                  className="text-xs min-h-[60px] font-mono"
                />
              </Field>
              <div className="flex justify-end">
                <Button size="sm" onClick={handleSave} disabled={updateMut.isPending}>
                  {updateMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                  Save Prompts
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="raw">
          <Card>
            <CardContent className="p-4">
              <Textarea
                value={`# System\n${systemInstructions}\n\n# Role\n${roleInstructions}\n\n# Policy\n${policyInstructions}\n\n# Output\n${outputContract}`}
                readOnly
                className="text-xs min-h-[400px] font-mono"
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preview">
          <Card>
            <CardContent className="p-4">
              <pre className="text-[10px] font-mono whitespace-pre-wrap bg-muted/30 p-3 rounded">
                {previewQuery.data?.preview ?? "(no preview)"}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="diff">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">
                Diff against another version requires at least 2 versions. Visit the Versions
                section to create snapshots.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
        {label}
      </Label>
      {children}
    </div>
  );
}
