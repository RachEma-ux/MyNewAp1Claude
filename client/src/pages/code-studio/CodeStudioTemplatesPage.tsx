import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Loader2, Plus, FileStack, Trash2, Edit3, Upload, Shield, Copy,
  X, PlusCircle,
} from "lucide-react";
import { toast } from "sonner";
import yaml from "js-yaml";

type VariableDef = {
  key: string;
  label: string;
  type: "text" | "long_text";
  required?: boolean;
  placeholder?: string;
  helpText?: string;
};

const EMPTY_VAR: VariableDef = { key: "", label: "", type: "text", required: false, placeholder: "" };

function VariableEditor({ variables, onChange }: { variables: VariableDef[]; onChange: (v: VariableDef[]) => void }) {
  const add = () => onChange([...variables, { ...EMPTY_VAR }]);
  const remove = (i: number) => onChange(variables.filter((_, idx) => idx !== i));
  const update = (i: number, field: string, value: any) => {
    const next = [...variables];
    (next[i] as any)[field] = value;
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-[10px] font-semibold">Variable Definitions</Label>
        <Button type="button" variant="ghost" size="sm" className="h-6 text-[9px] px-1.5" onClick={add}>
          <PlusCircle className="h-3 w-3 mr-0.5" /> Add Variable
        </Button>
      </div>
      {variables.length === 0 && <p className="text-[10px] text-muted-foreground">No variables. Template will use fixed text.</p>}
      {variables.map((v, i) => (
        <div key={i} className="border rounded p-2 space-y-1.5 relative">
          <button type="button" onClick={() => remove(i)} className="absolute top-1 right-1 text-muted-foreground hover:text-destructive">
            <X className="h-3 w-3" />
          </button>
          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <Label className="text-[9px]">Key</Label>
              <Input className="h-6 text-[10px]" placeholder="e.g. targetPrompt" value={v.key} onChange={(e) => update(i, "key", e.target.value)} />
            </div>
            <div>
              <Label className="text-[9px]">Label</Label>
              <Input className="h-6 text-[10px]" placeholder="Display name" value={v.label} onChange={(e) => update(i, "label", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1.5 items-end">
            <div>
              <Label className="text-[9px]">Type</Label>
              <Select value={v.type} onValueChange={(val) => update(i, "type", val)}>
                <SelectTrigger className="h-6 text-[10px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="long_text">Long Text</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[9px]">Placeholder</Label>
              <Input className="h-6 text-[10px]" placeholder="Hint text" value={v.placeholder || ""} onChange={(e) => update(i, "placeholder", e.target.value)} />
            </div>
            <div className="flex items-center gap-1.5">
              <Switch checked={!!v.required} onCheckedChange={(checked) => update(i, "required", checked)} className="scale-75" />
              <span className="text-[9px] text-muted-foreground">Required</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function TemplateForm({ initial, onSubmit, submitLabel }: {
  initial?: any;
  onSubmit: (data: any) => void;
  submitLabel: string;
}) {
  const [name, setName] = useState(initial?.name || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [category, setCategory] = useState(initial?.category || "");
  const [templateType, setTemplateType] = useState(initial?.templateType || "general");
  const [titleTemplate, setTitleTemplate] = useState(initial?.titleTemplate || "");
  const [objectiveTemplate, setObjectiveTemplate] = useState(initial?.objectiveTemplate || "");
  const [defaultPriority, setDefaultPriority] = useState(initial?.defaultPriority || "normal");
  const [variables, setVariables] = useState<VariableDef[]>(initial?.variableSchema || []);

  const handleSubmit = () => {
    if (!name.trim()) return toast.error("Name is required");
    onSubmit({
      name: name.trim(),
      description: description.trim() || undefined,
      category: category.trim() || undefined,
      templateType: templateType || undefined,
      titleTemplate: titleTemplate || undefined,
      objectiveTemplate: objectiveTemplate || undefined,
      defaultPriority: defaultPriority || undefined,
      variableSchema: variables.filter((v) => v.key && v.label),
    });
  };

  return (
    <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
      <div>
        <Label className="text-[10px]">Template Name *</Label>
        <Input className="h-7 text-xs" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Audit Job" />
      </div>
      <div>
        <Label className="text-[10px]">Description</Label>
        <Textarea className="text-xs h-14 resize-none" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this template does..." />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label className="text-[10px]">Category</Label>
          <Input className="h-7 text-xs" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="audit" />
        </div>
        <div>
          <Label className="text-[10px]">Type</Label>
          <Input className="h-7 text-xs" value={templateType} onChange={(e) => setTemplateType(e.target.value)} placeholder="general" />
        </div>
        <div>
          <Label className="text-[10px]">Priority</Label>
          <Select value={defaultPriority} onValueChange={setDefaultPriority}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label className="text-[10px]">Title Template</Label>
        <Input className="h-7 text-xs" value={titleTemplate} onChange={(e) => setTitleTemplate(e.target.value)}
          placeholder="e.g. Audit: {{targetPrompt}}" />
        <p className="text-[9px] text-muted-foreground mt-0.5">{"Use {{variableKey}} for placeholders"}</p>
      </div>
      <div>
        <Label className="text-[10px]">Objective Template</Label>
        <Textarea className="text-xs h-32 resize-y font-mono" value={objectiveTemplate} onChange={(e) => setObjectiveTemplate(e.target.value)}
          placeholder={"Main prompt template...\nUse {{variableKey}} for user inputs"} />
      </div>
      <VariableEditor variables={variables} onChange={setVariables} />
      <Button size="sm" className="w-full text-xs" onClick={handleSubmit}>{submitLabel}</Button>
    </div>
  );
}

export default function CodeStudioTemplatesPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const templatesQuery = trpc.codeStudio.templates.list.useQuery({});
  const templates = templatesQuery.data ?? [];

  const seedMutation = trpc.codeStudio.templates.seed.useMutation({
    onSuccess: () => { toast.success("Built-in templates seeded"); templatesQuery.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const createMutation = trpc.codeStudio.templates.create.useMutation({
    onSuccess: () => { toast.success("Template created"); setCreateOpen(false); templatesQuery.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.codeStudio.templates.update.useMutation({
    onSuccess: () => { toast.success("Template updated"); setEditTarget(null); templatesQuery.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.codeStudio.templates.delete.useMutation({
    onSuccess: () => { toast.success("Template deleted"); templatesQuery.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const importMutation = trpc.codeStudio.templates.importFile.useMutation({
    onSuccess: (data) => { toast.success(`Imported ${data.imported} template(s)`); templatesQuery.refetch(); },
    onError: (e) => toast.error(`Import failed: ${e.message}`),
  });

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        let parsed: any;
        if (file.name.endsWith(".yaml") || file.name.endsWith(".yml")) {
          parsed = yaml.load(text);
        } else {
          parsed = JSON.parse(text);
        }
        if (!parsed || !Array.isArray(parsed.templates) || parsed.templates.length === 0) {
          toast.error('Invalid template file. Expected { "templates": [...] }');
          return;
        }
        importMutation.mutate({ templates: parsed.templates });
      } catch (err: any) {
        toast.error(`Parse error: ${err.message}`);
      }
    };
    reader.readAsText(file);
    if (fileRef.current) fileRef.current.value = "";
  };

  const hasBuiltIn = templates.some((t: any) => t.isBuiltIn);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <FileStack className="h-4 w-4 text-violet-500" /> Job Templates
          {templates.length > 0 && <Badge variant="secondary" className="text-[9px] px-1.5">{templates.length}</Badge>}
        </h2>
        <div className="flex items-center gap-1.5">
          {!hasBuiltIn && (
            <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
              <Shield className="h-3 w-3 mr-1" /> Seed Built-ins
            </Button>
          )}
          <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => fileRef.current?.click()} disabled={importMutation.isPending}>
            <Upload className="h-3 w-3 mr-1" /> Import Template File
          </Button>
          <input ref={fileRef} type="file" accept=".json,.yaml,.yml" className="hidden" onChange={handleFileImport} />
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="text-xs h-7"><Plus className="h-3 w-3 mr-1" /> New Template</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle className="text-sm">Create Job Template</DialogTitle></DialogHeader>
              <TemplateForm onSubmit={(data) => createMutation.mutate(data)} submitLabel="Create Template" />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {templatesQuery.isLoading && <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin" /></div>}
      {!templatesQuery.isLoading && templates.length === 0 && (
        <div className="text-center py-8">
          <p className="text-xs text-muted-foreground">No templates yet.</p>
          <p className="text-[10px] text-muted-foreground mt-1">Create one or click "Seed Built-ins" to add the Audit Job template.</p>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {templates.map((t: any) => (
          <Card key={t.id} className="hover:border-violet-500/30 transition-colors">
            <CardContent className="p-3">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-semibold truncate">{t.name}</p>
                    {t.isBuiltIn && <Badge variant="secondary" className="text-[8px] px-1">Built-in</Badge>}
                    {t.category && <Badge variant="outline" className="text-[8px] px-1">{t.category}</Badge>}
                  </div>
                  {t.description && <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">{t.description}</p>}
                </div>
                <div className="flex items-center gap-0.5 shrink-0 ml-2">
                  <button title="Edit" className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                    onClick={() => setEditTarget(t)}>
                    <Edit3 className="h-3 w-3" />
                  </button>
                  <button title="Delete" className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    onClick={() => { if (confirm(`Delete "${t.name}"?`)) deleteMutation.mutate({ id: t.id }); }}>
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-1.5 text-[9px] text-muted-foreground">
                <span>#{t.id}</span>
                <span>{t.templateType || "general"}</span>
                {((t.variableSchema as any[]) || []).length > 0 && (
                  <span>{((t.variableSchema as any[]) || []).length} variable(s)</span>
                )}
                <span>{t.defaultPriority}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="text-sm">Edit Template</DialogTitle></DialogHeader>
          {editTarget && (
            <TemplateForm
              initial={editTarget}
              onSubmit={(data) => updateMutation.mutate({ id: editTarget.id, ...data })}
              submitLabel="Save Changes"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
