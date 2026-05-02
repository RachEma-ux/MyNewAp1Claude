/**
 * AI Agent Studio — Tools Catalog Page (Phase 13e)
 *
 * Global page (no agentId) for browsing and authoring catalog tools.
 * Merges 3 sources via the catalogTools.listMerged() endpoint:
 *   - Built-in 51 (read-only, source="builtin")
 *   - User-created in DB (source="db")
 *   - MCP-discovered when a draftId is supplied (source="mcp", Phase 15d)
 *
 * Built-in tools and MCP tools are read-only — only DB tools can be
 * edited or deleted. The "+ New Tool" button creates a DB tool with
 * one of three invocation kinds: shell, http, or mcp_ref.
 *
 * Mutations are governedProcedure on the server (Decision #2) — shell
 * and http tools create executable command surfaces.
 */
import { useState } from "react";
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
  Wrench,
  Search as SearchIcon,
  X,
  Pencil,
  Eye,
} from "lucide-react";
import {
  PageHeader,
  EmptyState,
  LoadingState,
} from "../components/ui";

const SOURCE_COLORS: Record<string, string> = {
  builtin: "border-blue-500/40 text-blue-400",
  db: "border-emerald-500/40 text-emerald-400",
  mcp: "border-cyan-500/40 text-cyan-400",
};

interface ToolFormState {
  key: string;
  name: string;
  description: string;
  category:
    | "filesystem"
    | "compute"
    | "communication"
    | "network"
    | "search"
    | "custom";
  invocationKind: "shell" | "http" | "mcp_ref";
  // shell fields
  argv: string;
  envText: string;
  // http fields
  url: string;
  method: string;
  headersText: string;
  // mcp_ref fields
  mcpServerId: string;
  mcpToolName: string;
  // shared
  destructive: boolean;
  defaultRequiresApproval: boolean;
  inputSchemaText: string;
}

const EMPTY_FORM: ToolFormState = {
  key: "",
  name: "",
  description: "",
  category: "custom",
  invocationKind: "shell",
  argv: "",
  envText: "",
  url: "",
  method: "POST",
  headersText: "",
  mcpServerId: "",
  mcpToolName: "",
  destructive: false,
  defaultRequiresApproval: false,
  inputSchemaText: "{}",
};

export default function AgentToolCatalogPage() {
  const utils = trpc.useUtils();
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [search, setSearch] = useState<string>("");

  const listQuery = trpc.agentStudio.catalogTools.listMerged.useQuery({
    category: categoryFilter || undefined,
    search: search || undefined,
  });

  // Editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [viewingId, setViewingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ToolFormState>(EMPTY_FORM);
  const [validation, setValidation] = useState<{
    errors: string[];
    warnings: string[];
  } | null>(null);

  const createMut = trpc.agentStudio.catalogTools.create.useMutation({
    onSuccess: () => {
      toast.success("Tool created");
      utils.agentStudio.catalogTools.listMerged.invalidate();
      closeEditor();
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.agentStudio.catalogTools.update.useMutation({
    onSuccess: () => {
      toast.success("Tool updated");
      utils.agentStudio.catalogTools.listMerged.invalidate();
      closeEditor();
    },
    onError: (e) => toast.error(e.message),
  });
  const removeMut = trpc.agentStudio.catalogTools.remove.useMutation({
    onSuccess: () => {
      toast.success("Tool removed");
      utils.agentStudio.catalogTools.listMerged.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const validateMut = trpc.agentStudio.catalogTools.validate.useMutation({
    onSuccess: (r) => {
      setValidation({ errors: r.errors, warnings: r.warnings });
      if (r.ok) toast.success("Valid");
      else toast.error(`Invalid — ${r.errors.length} error(s)`);
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
    if (row.source !== "db") {
      // View-only for built-in / mcp
      setViewingId(row.id ?? null);
      return;
    }
    setEditingId(row.id);
    const cfg = (row.invocationConfig ?? {}) as Record<string, any>;
    setForm({
      key: row.key,
      name: row.name,
      description: row.description ?? "",
      category: (row.category ?? "custom") as any,
      invocationKind: row.invocationKind as any,
      argv: Array.isArray(cfg.argv) ? cfg.argv.join(" ") : "",
      envText: cfg.env
        ? Object.entries(cfg.env)
            .map(([k, v]) => `${k}=${v}`)
            .join("\n")
        : "",
      url: cfg.url ?? "",
      method: cfg.method ?? "POST",
      headersText: cfg.headers
        ? Object.entries(cfg.headers)
            .map(([k, v]) => `${k}: ${v}`)
            .join("\n")
        : "",
      mcpServerId: cfg.serverId?.toString() ?? "",
      mcpToolName: cfg.toolName ?? "",
      destructive: row.destructive ?? false,
      defaultRequiresApproval: row.defaultRequiresApproval ?? false,
      inputSchemaText: JSON.stringify(row.inputSchema ?? {}, null, 2),
    });
    setValidation(null);
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setValidation(null);
  }

  function buildPayload(): any {
    let invocationConfig: Record<string, unknown> = {};
    if (form.invocationKind === "shell") {
      const argv = form.argv.trim().split(/\s+/).filter(Boolean);
      const env: Record<string, string> = {};
      for (const line of form.envText.split("\n")) {
        const t = line.trim();
        if (!t) continue;
        const eq = t.indexOf("=");
        if (eq < 0) continue;
        env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
      }
      invocationConfig = { argv, ...(Object.keys(env).length ? { env } : {}) };
    } else if (form.invocationKind === "http") {
      const headers: Record<string, string> = {};
      for (const line of form.headersText.split("\n")) {
        const t = line.trim();
        if (!t) continue;
        const colon = t.indexOf(":");
        if (colon < 0) continue;
        headers[t.slice(0, colon).trim()] = t.slice(colon + 1).trim();
      }
      invocationConfig = {
        url: form.url,
        method: form.method,
        ...(Object.keys(headers).length ? { headers } : {}),
      };
    } else if (form.invocationKind === "mcp_ref") {
      invocationConfig = {
        serverId: parseInt(form.mcpServerId, 10),
        toolName: form.mcpToolName,
      };
    }

    let inputSchema: Record<string, unknown> = {};
    try {
      inputSchema = JSON.parse(form.inputSchemaText || "{}");
    } catch {
      // Validation will catch this
    }

    return {
      key: form.key.trim(),
      name: form.name.trim(),
      description: form.description.trim() || null,
      category: form.category,
      invocationKind: form.invocationKind,
      invocationConfig,
      inputSchema,
      destructive: form.destructive,
      defaultRequiresApproval: form.defaultRequiresApproval,
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
    if (!window.confirm("Delete this tool from the catalog?")) return;
    removeMut.mutate({ id });
  }

  if (listQuery.isLoading) return <LoadingState label="Loading tools…" />;

  const merged = listQuery.data;
  const allRows = merged?.all ?? [];
  let filteredRows = allRows;
  if (sourceFilter) {
    filteredRows = filteredRows.filter((r: any) => r.source === sourceFilter);
  }

  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Tools Catalog"
        subtitle="Browse built-in tools and author custom shell, http, or mcp_ref tools."
        icon={<Wrench className="h-4 w-4 text-cyan-500" />}
        actions={
          <Button size="sm" onClick={openEditorForCreate}>
            <Plus className="h-3.5 w-3.5 mr-1" /> New Tool
          </Button>
        }
      />

      {/* Filter row */}
      <Card>
        <CardContent className="p-3 flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/60" />
            <Input
              placeholder="Search by key, name, or description…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 text-xs pl-7"
            />
          </div>
          <select
            className="h-7 px-2 rounded border bg-background text-xs"
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
          >
            <option value="">All sources</option>
            <option value="builtin">Built-in</option>
            <option value="db">DB</option>
            <option value="mcp">MCP</option>
          </select>
          <select
            className="h-7 px-2 rounded border bg-background text-xs"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">All categories</option>
            <option value="filesystem">filesystem</option>
            <option value="compute">compute</option>
            <option value="communication">communication</option>
            <option value="network">network</option>
            <option value="search">search</option>
            <option value="custom">custom</option>
            <option value="mcp">mcp</option>
          </select>
          <span className="text-[10px] text-muted-foreground">
            {filteredRows.length} tool{filteredRows.length === 1 ? "" : "s"}
          </span>
        </CardContent>
      </Card>

      {/* Tools table */}
      <Card>
        <CardContent className="p-3">
          {filteredRows.length === 0 ? (
            <EmptyState
              icon={<Wrench className="h-7 w-7" />}
              title="No tools match"
              description="Try clearing filters, or create a new tool."
            />
          ) : (
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-muted-foreground/70 border-b">
                <tr>
                  <th className="text-left py-1.5 font-semibold">Tool</th>
                  <th className="text-left py-1.5 font-semibold">Category</th>
                  <th className="text-left py-1.5 font-semibold">Source</th>
                  <th className="text-left py-1.5 font-semibold">Kind</th>
                  <th className="text-left py-1.5 font-semibold">Flags</th>
                  <th className="text-right py-1.5 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r: any, i: number) => (
                  <tr
                    key={r.id ?? `${r.source}-${i}`}
                    className="border-t hover:bg-muted/40"
                  >
                    <td className="py-2">
                      <div className="font-mono text-[11px]">{r.key}</div>
                      <div className="text-[10px] text-muted-foreground/70">
                        {r.name}
                      </div>
                    </td>
                    <td className="text-[10px] text-muted-foreground">
                      {r.category}
                    </td>
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
                    <td className="text-[10px] font-mono">{r.invocationKind}</td>
                    <td>
                      <div className="flex items-center gap-1">
                        {r.destructive && (
                          <Badge
                            variant="outline"
                            className="text-[8px] border-red-500/40 text-red-400"
                          >
                            destructive
                          </Badge>
                        )}
                        {r.defaultRequiresApproval && (
                          <Badge
                            variant="outline"
                            className="text-[8px] border-yellow-500/40 text-yellow-400"
                          >
                            approval
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {r.source === "db" ? (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0"
                              onClick={() => openEditorForRow(r)}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0"
                              onClick={() => handleDelete(r.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </>
                        ) : (
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

      {/* Editor modal */}
      {editorOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-3xl max-h-[90vh] overflow-auto">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  {editingId ? "Edit tool" : "New tool"}
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
                <Field label="Key (PascalCase)">
                  <Input
                    value={form.key}
                    onChange={(e) =>
                      setForm({ ...form, key: e.target.value })
                    }
                    className="h-7 text-xs font-mono"
                    placeholder="MyCustomTool"
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
                <Field label="Category">
                  <select
                    className="h-7 px-2 rounded border bg-background text-xs w-full"
                    value={form.category}
                    onChange={(e) =>
                      setForm({ ...form, category: e.target.value as any })
                    }
                  >
                    <option value="filesystem">filesystem</option>
                    <option value="compute">compute</option>
                    <option value="communication">communication</option>
                    <option value="network">network</option>
                    <option value="search">search</option>
                    <option value="custom">custom</option>
                  </select>
                </Field>
                <Field label="Invocation kind">
                  <select
                    className="h-7 px-2 rounded border bg-background text-xs w-full"
                    value={form.invocationKind}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        invocationKind: e.target.value as any,
                      })
                    }
                  >
                    <option value="shell">shell (spawn argv)</option>
                    <option value="http">http (POST/GET)</option>
                    <option value="mcp_ref">mcp_ref (alias MCP tool)</option>
                  </select>
                </Field>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                    Flags
                  </Label>
                  <div className="flex items-center gap-3 text-[10px]">
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={form.destructive}
                        onChange={(e) =>
                          setForm({ ...form, destructive: e.target.checked })
                        }
                      />
                      destructive
                    </label>
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={form.defaultRequiresApproval}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            defaultRequiresApproval: e.target.checked,
                          })
                        }
                      />
                      requires approval
                    </label>
                  </div>
                </div>
              </div>

              {/* Kind-specific fields */}
              {form.invocationKind === "shell" && (
                <>
                  <Field label="argv (whitespace-separated)">
                    <Input
                      value={form.argv}
                      onChange={(e) =>
                        setForm({ ...form, argv: e.target.value })
                      }
                      className="h-7 text-xs font-mono"
                      placeholder="wc -l {file}"
                    />
                  </Field>
                  <Field label="env (KEY=value per line)">
                    <Textarea
                      value={form.envText}
                      onChange={(e) =>
                        setForm({ ...form, envText: e.target.value })
                      }
                      className="text-[10px] font-mono min-h-[60px]"
                      placeholder="DEBUG=1&#10;PATH=/usr/bin"
                    />
                  </Field>
                </>
              )}

              {form.invocationKind === "http" && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="md:col-span-2">
                      <Field label="URL">
                        <Input
                          value={form.url}
                          onChange={(e) =>
                            setForm({ ...form, url: e.target.value })
                          }
                          className="h-7 text-xs font-mono"
                          placeholder="https://api.example.com/tool"
                        />
                      </Field>
                    </div>
                    <Field label="Method">
                      <select
                        className="h-7 px-2 rounded border bg-background text-xs w-full"
                        value={form.method}
                        onChange={(e) =>
                          setForm({ ...form, method: e.target.value })
                        }
                      >
                        <option value="GET">GET</option>
                        <option value="POST">POST</option>
                        <option value="PUT">PUT</option>
                        <option value="DELETE">DELETE</option>
                      </select>
                    </Field>
                  </div>
                  <Field label="Headers (Header: value per line)">
                    <Textarea
                      value={form.headersText}
                      onChange={(e) =>
                        setForm({ ...form, headersText: e.target.value })
                      }
                      className="text-[10px] font-mono min-h-[60px]"
                      placeholder="Content-Type: application/json&#10;X-API-Key: secret"
                    />
                  </Field>
                </>
              )}

              {form.invocationKind === "mcp_ref" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field label="MCP Server ID">
                    <Input
                      value={form.mcpServerId}
                      onChange={(e) =>
                        setForm({ ...form, mcpServerId: e.target.value })
                      }
                      className="h-7 text-xs font-mono"
                      placeholder="42"
                    />
                  </Field>
                  <Field label="Tool name on MCP server">
                    <Input
                      value={form.mcpToolName}
                      onChange={(e) =>
                        setForm({ ...form, mcpToolName: e.target.value })
                      }
                      className="h-7 text-xs font-mono"
                      placeholder="search_repo"
                    />
                  </Field>
                </div>
              )}

              <Field label="Input schema (JSON Schema, optional)">
                <Textarea
                  value={form.inputSchemaText}
                  onChange={(e) =>
                    setForm({ ...form, inputSchemaText: e.target.value })
                  }
                  className="text-[10px] font-mono min-h-[80px]"
                  placeholder='{ "type": "object", "properties": {} }'
                />
              </Field>

              {/* Validation panel */}
              {validation && (
                <div className="rounded border p-2 text-[10px] space-y-1">
                  {validation.errors.length === 0 ? (
                    <div className="text-emerald-400">✓ Valid</div>
                  ) : (
                    validation.errors.map((err, i) => (
                      <div key={`err-${i}`} className="text-red-400">
                        ✗ {err}
                      </div>
                    ))
                  )}
                  {validation.warnings.map((w, i) => (
                    <div key={`warn-${i}`} className="text-amber-400">
                      ⚠ {w}
                    </div>
                  ))}
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
