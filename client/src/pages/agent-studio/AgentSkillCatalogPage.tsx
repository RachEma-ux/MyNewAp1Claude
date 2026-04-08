/**
 * AI Agent Studio — Skills Catalog Page (Phase 13e)
 *
 * Global page (no agentId) for browsing, creating, editing, importing,
 * and deleting catalog skills. Merges:
 *   - vendored .md skills (read-only, source="vendored")
 *   - DB rows (source="db" or "imported")
 *
 * Operations:
 *   • Browse: filter by pack / source / search
 *   • Create: form with frontmatter fields + markdown body editor
 *   • Edit: same form, populated from existing row
 *   • Delete: only for db / imported rows (vendored is immutable)
 *   • Import .md: hidden file picker → batch upload → per-file results
 *
 * Tool name validation happens server-side at save time. The UI
 * relies on the server's Phase 13b validator (stricter than upstream
 * openclaude — typo'd tool names are rejected, not silently accepted).
 */
import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Loader2,
  Plus,
  Trash2,
  Library,
  Upload,
  Pencil,
  Search as SearchIcon,
  X,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import {
  PageHeader,
  EmptyState,
  LoadingState,
} from "@/components/agent-studio/ui";

const SOURCE_COLORS: Record<string, string> = {
  vendored: "border-blue-500/40 text-blue-400",
  db: "border-emerald-500/40 text-emerald-400",
  imported: "border-amber-500/40 text-amber-400",
  marketplace: "border-purple-500/40 text-purple-400",
  mcp_prompt: "border-cyan-500/40 text-cyan-400",
};

interface SkillFormState {
  packKey: string;
  skillKey: string;
  name: string;
  description: string;
  context: "inline" | "fork";
  agent: string;
  model: "" | "sonnet" | "opus" | "haiku";
  allowedTools: string;
  effort: "" | "low" | "medium" | "high";
  body: string;
}

const EMPTY_FORM: SkillFormState = {
  packKey: "imported",
  skillKey: "",
  name: "",
  description: "",
  context: "fork",
  agent: "general-purpose",
  model: "",
  allowedTools: "",
  effort: "",
  body:
    "You are a <role>.\n\nFocus: $ARGUMENTS\n\nTasks:\n1. \n2. \n\nReport:\n- ",
};

export default function AgentSkillCatalogPage() {
  const utils = trpc.useUtils();
  const [packFilter, setPackFilter] = useState<string>("");
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [search, setSearch] = useState<string>("");

  const listQuery = trpc.agentStudio.catalogSkills.listMerged.useQuery({
    packKey: packFilter || undefined,
    source: sourceFilter || undefined,
    search: search || undefined,
  });

  // Editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<SkillFormState>(EMPTY_FORM);
  const [validation, setValidation] = useState<{
    errors: string[];
    warnings: string[];
  } | null>(null);

  const createMut = trpc.agentStudio.catalogSkills.create.useMutation({
    onSuccess: () => {
      toast.success("Skill created");
      utils.agentStudio.catalogSkills.listMerged.invalidate();
      closeEditor();
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.agentStudio.catalogSkills.update.useMutation({
    onSuccess: () => {
      toast.success("Skill updated");
      utils.agentStudio.catalogSkills.listMerged.invalidate();
      closeEditor();
    },
    onError: (e) => toast.error(e.message),
  });
  const removeMut = trpc.agentStudio.catalogSkills.remove.useMutation({
    onSuccess: () => {
      toast.success("Skill removed");
      utils.agentStudio.catalogSkills.listMerged.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const validateMut = trpc.agentStudio.catalogSkills.validate.useMutation({
    onSuccess: (r) => {
      setValidation({ errors: r.errors, warnings: r.warnings });
      if (r.ok) {
        if (r.warnings.length > 0) {
          toast.success(`Valid (${r.warnings.length} warning${r.warnings.length === 1 ? "" : "s"})`);
        } else {
          toast.success("Valid");
        }
      } else {
        toast.error(`Invalid — ${r.errors.length} error${r.errors.length === 1 ? "" : "s"}`);
      }
    },
    onError: (e) => toast.error(e.message),
  });

  // Import state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importResults, setImportResults] = useState<any[] | null>(null);
  const [overwriteOnImport, setOverwriteOnImport] = useState(false);
  const importMut = trpc.agentStudio.catalogSkills.importFromMarkdown.useMutation({
    onSuccess: (r) => {
      setImportResults(r.results);
      const { imported, failed, overwritten } = r.summary;
      toast.success(
        `Import: ${imported} new, ${overwritten} overwritten, ${failed} failed`
      );
      utils.agentStudio.catalogSkills.listMerged.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  function openEditorForCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setValidation(null);
    setEditorOpen(true);
  }

  function openEditorForRow(row: any) {
    setEditingId(row.id ?? null);
    setForm({
      packKey: row.packKey,
      skillKey: row.skillKey,
      name: row.name,
      description: row.description ?? "",
      context: (row.context ?? "fork") as "inline" | "fork",
      agent: row.agent ?? "general-purpose",
      model: (row.model ?? "") as any,
      allowedTools: (row.allowedTools ?? []).join(", "),
      effort: (row.effort ?? "") as any,
      body: row.body ?? "",
    });
    setValidation(null);
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    setForm(EMPTY_FORM);
    setEditingId(null);
    setValidation(null);
  }

  function buildPayload() {
    return {
      packKey: form.packKey.trim(),
      skillKey: form.skillKey.trim(),
      name: form.name.trim(),
      description: form.description.trim() || null,
      context: form.context,
      agent: form.agent.trim() || null,
      model: form.model || null,
      allowedTools: form.allowedTools
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      effort: form.effort || null,
      body: form.body,
    };
  }

  function handleValidate() {
    validateMut.mutate(buildPayload());
  }
  function handleSave() {
    if (editingId) {
      updateMut.mutate({ id: editingId, ...buildPayload() });
    } else {
      createMut.mutate(buildPayload());
    }
  }
  function handleDelete(id: number) {
    if (!window.confirm("Delete this skill from the catalog?")) return;
    removeMut.mutate({ id });
  }
  function handleImportClick() {
    fileInputRef.current?.click();
  }
  async function handleImportFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    const payloads: { fileName: string; content: string }[] = [];
    for (const f of files) {
      const content = await f.text();
      payloads.push({ fileName: f.name, content });
    }
    setImportResults(null);
    importMut.mutate({
      files: payloads,
      overwrite: overwriteOnImport,
    });
    // Reset the input so the same file can be re-picked
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  if (listQuery.isLoading) return <LoadingState label="Loading skills…" />;

  const merged = listQuery.data;
  const allRows = merged?.all ?? [];
  // Build a unique pack list from merged data for the filter chip
  const packs = Array.from(
    new Set(allRows.map((r: any) => r.packKey))
  ).sort();

  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Skills Catalog"
        subtitle="Browse, author, and import .md skill files. Merges vendored skills with user-created and imported entries."
        icon={<Library className="h-4 w-4 text-emerald-500" />}
        actions={
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,text/markdown"
              multiple
              className="hidden"
              onChange={handleImportFiles}
            />
            <label className="text-[10px] text-muted-foreground flex items-center gap-1 mr-1">
              <input
                type="checkbox"
                checked={overwriteOnImport}
                onChange={(e) => setOverwriteOnImport(e.target.checked)}
              />
              overwrite
            </label>
            <Button
              size="sm"
              variant="outline"
              onClick={handleImportClick}
              disabled={importMut.isPending}
            >
              {importMut.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5 mr-1" />
              )}
              Import .md
            </Button>
            <Button size="sm" onClick={openEditorForCreate}>
              <Plus className="h-3.5 w-3.5 mr-1" /> New Skill
            </Button>
          </>
        }
      />

      {/* Filter row */}
      <Card>
        <CardContent className="p-3 flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/60" />
            <Input
              placeholder="Search by name, key, or description…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 text-xs pl-7"
            />
          </div>
          <select
            className="h-7 px-2 rounded border bg-background text-xs"
            value={packFilter}
            onChange={(e) => setPackFilter(e.target.value)}
          >
            <option value="">All packs</option>
            {packs.map((p) => (
              <option key={p as string} value={p as string}>
                {p as string}
              </option>
            ))}
          </select>
          <select
            className="h-7 px-2 rounded border bg-background text-xs"
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
          >
            <option value="">All sources</option>
            <option value="vendored">Vendored</option>
            <option value="db">DB</option>
            <option value="imported">Imported</option>
            <option value="marketplace">Marketplace</option>
            <option value="mcp_prompt">MCP prompt</option>
          </select>
        </CardContent>
      </Card>

      {/* Import results banner */}
      {importResults && (
        <Card>
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <strong className="text-xs">Import results</strong>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0"
                onClick={() => setImportResults(null)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
            <ul className="space-y-1">
              {importResults.map((r, i) => (
                <li
                  key={i}
                  className={`text-[10px] flex items-center gap-2 rounded p-1.5 ${
                    r.ok
                      ? "bg-emerald-500/5 border border-emerald-500/20"
                      : "bg-red-500/5 border border-red-500/20"
                  }`}
                >
                  {r.ok ? (
                    <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                  ) : (
                    <AlertCircle className="h-3 w-3 text-red-500 shrink-0" />
                  )}
                  <span className="font-mono">{r.fileName}</span>
                  {r.ok && r.skillKey && (
                    <span className="text-muted-foreground">
                      → {r.packKey}/{r.skillKey}
                    </span>
                  )}
                  {!r.ok && r.errors && (
                    <span className="text-red-400">{r.errors.join("; ")}</span>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Skills table */}
      <Card>
        <CardContent className="p-3">
          {allRows.length === 0 ? (
            <EmptyState
              icon={<Library className="h-7 w-7" />}
              title="No skills yet"
              description="Import .md files or create a new skill to get started."
              action={
                <Button size="sm" onClick={openEditorForCreate}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Create First Skill
                </Button>
              }
            />
          ) : (
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-muted-foreground/70 border-b">
                <tr>
                  <th className="text-left py-1.5 font-semibold">Skill</th>
                  <th className="text-left py-1.5 font-semibold">Pack</th>
                  <th className="text-left py-1.5 font-semibold">Source</th>
                  <th className="text-left py-1.5 font-semibold">Tools</th>
                  <th className="text-right py-1.5 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {allRows.map((r: any, i: number) => (
                  <tr key={r.id ?? `vendored-${i}`} className="border-t hover:bg-muted/40">
                    <td className="py-2">
                      <div className="font-medium">{r.name}</div>
                      <div className="text-[10px] text-muted-foreground/70 font-mono">
                        {r.skillKey}
                      </div>
                    </td>
                    <td className="text-[10px] font-mono">{r.packKey}</td>
                    <td>
                      <Badge
                        variant="outline"
                        className={`text-[9px] uppercase tracking-wider ${
                          SOURCE_COLORS[r.source] ?? ""
                        }`}
                      >
                        {r.source}
                      </Badge>
                    </td>
                    <td className="text-[10px] text-muted-foreground">
                      {(r.allowedTools ?? []).length}
                    </td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {r.id != null && (r.source === "db" || r.source === "imported") && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0"
                              onClick={() => openEditorForRow(r)}
                              title="Edit"
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0"
                              onClick={() => handleDelete(r.id)}
                              title="Delete"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </>
                        )}
                        {r.source === "vendored" && (
                          <span className="text-[9px] text-muted-foreground/60">
                            read-only
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Editor modal — overlay */}
      {editorOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-3xl max-h-[90vh] overflow-auto">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  {editingId ? "Edit skill" : "New skill"}
                </h3>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0"
                  onClick={closeEditor}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Pack key">
                  <Input
                    value={form.packKey}
                    onChange={(e) =>
                      setForm({ ...form, packKey: e.target.value })
                    }
                    className="h-7 text-xs font-mono"
                    placeholder="imported"
                  />
                </Field>
                <Field label="Skill key">
                  <Input
                    value={form.skillKey}
                    onChange={(e) =>
                      setForm({ ...form, skillKey: e.target.value })
                    }
                    className="h-7 text-xs font-mono"
                    placeholder="my-skill"
                  />
                </Field>
                <Field label="Display name">
                  <Input
                    value={form.name}
                    onChange={(e) =>
                      setForm({ ...form, name: e.target.value })
                    }
                    className="h-7 text-xs"
                  />
                </Field>
                <Field label="Description">
                  <Input
                    value={form.description}
                    onChange={(e) =>
                      setForm({ ...form, description: e.target.value })
                    }
                    className="h-7 text-xs"
                  />
                </Field>
                <Field label="Context">
                  <select
                    className="h-7 px-2 rounded border bg-background text-xs w-full"
                    value={form.context}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        context: e.target.value as "inline" | "fork",
                      })
                    }
                  >
                    <option value="inline">inline</option>
                    <option value="fork">fork</option>
                  </select>
                </Field>
                <Field label="Agent">
                  <Input
                    value={form.agent}
                    onChange={(e) =>
                      setForm({ ...form, agent: e.target.value })
                    }
                    className="h-7 text-xs"
                    placeholder="general-purpose"
                  />
                </Field>
                <Field label="Model (optional)">
                  <select
                    className="h-7 px-2 rounded border bg-background text-xs w-full"
                    value={form.model}
                    onChange={(e) =>
                      setForm({ ...form, model: e.target.value as any })
                    }
                  >
                    <option value="">(inherit)</option>
                    <option value="sonnet">sonnet</option>
                    <option value="opus">opus</option>
                    <option value="haiku">haiku</option>
                  </select>
                </Field>
                <Field label="Effort (optional)">
                  <select
                    className="h-7 px-2 rounded border bg-background text-xs w-full"
                    value={form.effort}
                    onChange={(e) =>
                      setForm({ ...form, effort: e.target.value as any })
                    }
                  >
                    <option value="">(none)</option>
                    <option value="low">low</option>
                    <option value="medium">medium</option>
                    <option value="high">high</option>
                  </select>
                </Field>
              </div>

              <Field label="Allowed tools (comma-separated)">
                <Input
                  value={form.allowedTools}
                  onChange={(e) =>
                    setForm({ ...form, allowedTools: e.target.value })
                  }
                  className="h-7 text-xs font-mono"
                  placeholder="Bash, Read, Grep, Glob"
                />
              </Field>

              <Field label="Body (markdown)">
                <Textarea
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                  className="text-[11px] font-mono min-h-[200px]"
                  placeholder="You are a ..."
                />
              </Field>

              {/* Validation panel */}
              {validation && (
                <div className="rounded border p-2 text-[10px] space-y-1">
                  {validation.errors.length === 0 &&
                  validation.warnings.length === 0 ? (
                    <div className="text-emerald-400">✓ Valid</div>
                  ) : (
                    <>
                      {validation.errors.map((err, i) => (
                        <div key={`err-${i}`} className="text-red-400">
                          ✗ {err}
                        </div>
                      ))}
                      {validation.warnings.map((w, i) => (
                        <div key={`warn-${i}`} className="text-amber-400">
                          ⚠ {w}
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleValidate}
                  disabled={validateMut.isPending}
                >
                  {validateMut.isPending && (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  )}
                  Validate
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={createMut.isPending || updateMut.isPending}
                >
                  {(createMut.isPending || updateMut.isPending) && (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  )}
                  {editingId ? "Save" : "Create"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
        {label}
      </Label>
      {children}
    </div>
  );
}
