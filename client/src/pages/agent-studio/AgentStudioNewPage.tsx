/**
 * AI Agent Studio — New Agent Page
 *
 * Creation starts inside the Studio. Three modes: blank, from template,
 * import definition.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Bot, FileStack, FileInput, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/agent-studio/ui";

export default function AgentStudioNewPage() {
  const [, navigate] = useLocation();
  const [name, setName] = useState("");
  const [internalKey, setInternalKey] = useState("");
  const [description, setDescription] = useState("");
  const [agentClass, setAgentClass] = useState("assistant");
  const [templateKey, setTemplateKey] = useState("");
  const [importJson, setImportJson] = useState("");

  const templatesQuery = trpc.agentStudio.creation.listTemplates.useQuery();

  const createBlank = trpc.agentStudio.creation.createBlankAgent.useMutation({
    onSuccess: (a: any) => {
      toast.success(`Created '${a.name}'`);
      navigate(`/agent-studio/${a.id}/identity`);
    },
    onError: (e) => toast.error(e.message),
  });

  const createFromTemplate = trpc.agentStudio.creation.createFromTemplate.useMutation({
    onSuccess: (a: any) => {
      toast.success(`Created '${a.name}' from template`);
      navigate(`/agent-studio/${a.id}/identity`);
    },
    onError: (e) => toast.error(e.message),
  });

  const importDef = trpc.agentStudio.creation.importDefinition.useMutation({
    onSuccess: (a: any) => {
      toast.success(`Imported '${a.name}'`);
      navigate(`/agent-studio/${a.id}/identity`);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleImport = () => {
    let definition: Record<string, any> = {};
    try {
      definition = JSON.parse(importJson || "{}");
    } catch {
      toast.error("Invalid JSON");
      return;
    }
    importDef.mutate({ name, internalKey, definition });
  };

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-4">
      <PageHeader
        title="Create New Agent"
        subtitle="Creation starts inside the Studio. Pick a mode below."
        icon={<Bot className="h-4 w-4 text-blue-500" />}
      />

      <Tabs defaultValue="blank">
        <TabsList>
          <TabsTrigger value="blank">
            <Bot className="h-3.5 w-3.5 mr-1.5" /> Blank
          </TabsTrigger>
          <TabsTrigger value="template">
            <FileStack className="h-3.5 w-3.5 mr-1.5" /> From Template
          </TabsTrigger>
          <TabsTrigger value="import">
            <FileInput className="h-3.5 w-3.5 mr-1.5" /> Import Definition
          </TabsTrigger>
        </TabsList>

        <TabsContent value="blank">
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Internal Key (lowercase, dashes)</Label>
                <Input
                  value={internalKey}
                  onChange={(e) => setInternalKey(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "-"))}
                  className="h-8 text-xs font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Description</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="text-xs min-h-[60px]"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Agent Class</Label>
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
              </div>
              <Button
                size="sm"
                disabled={!name || !internalKey || createBlank.isPending}
                onClick={() =>
                  createBlank.mutate({
                    name,
                    internalKey,
                    description,
                    agentClass: agentClass as any,
                  })
                }
              >
                {createBlank.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                Create Agent
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="template">
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Pick a template</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {(templatesQuery.data ?? []).map((t: any) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setTemplateKey(t.key)}
                      className={`text-left border rounded p-2 text-xs transition-colors ${
                        templateKey === t.key
                          ? "border-primary bg-primary/5"
                          : "hover:bg-muted/30"
                      }`}
                    >
                      <div className="font-medium">{t.name}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {t.description}
                      </div>
                      <div className="text-[10px] text-muted-foreground/70 mt-0.5 font-mono">
                        {t.key}
                      </div>
                      <div className="text-[10px] mt-1">
                        <span className="opacity-60">tools:</span>{" "}
                        {(t.toolKeys ?? []).join(", ") || "—"}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Internal Key (lowercase, dashes)</Label>
                <Input
                  value={internalKey}
                  onChange={(e) =>
                    setInternalKey(
                      e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "-")
                    )
                  }
                  className="h-8 text-xs font-mono"
                />
              </div>
              <Button
                size="sm"
                disabled={!templateKey || !name || !internalKey || createFromTemplate.isPending}
                onClick={() => createFromTemplate.mutate({ templateKey, name, internalKey })}
              >
                {createFromTemplate.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                Create From Template
              </Button>
              <p className="text-[10px] text-muted-foreground">
                Selecting a template will pre-populate the agent's behavior, prompts,
                tools, knowledge bindings, and governance policy.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="import">
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Internal Key (lowercase, dashes)</Label>
                <Input
                  value={internalKey}
                  onChange={(e) =>
                    setInternalKey(
                      e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "-")
                    )
                  }
                  className="h-8 text-xs font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Definition JSON</Label>
                <Textarea
                  value={importJson}
                  onChange={(e) => setImportJson(e.target.value)}
                  className="text-xs font-mono min-h-[160px]"
                  placeholder='{"mission":"...","scope":"...","systemInstructions":"..."}'
                />
              </div>
              <Button
                size="sm"
                disabled={!name || !internalKey || importDef.isPending}
                onClick={handleImport}
              >
                Import
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
