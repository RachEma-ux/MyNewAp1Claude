// GraphSkillAdminPanel — no-deferral continuation-32 slice 129.
//
// Closes the partial-consumer gap on `graphSkill.{listPackVersions,
// createPack, publishVersion}` — 3 unconsumed endpoints.

import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionLabel } from "./ui";

const RISK_LEVELS = ["low", "medium", "high"] as const;
type RiskLevel = (typeof RISK_LEVELS)[number];

function parsePositiveInt(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function parseJsonRecord(s: string): Record<string, unknown> | null {
  const trimmed = s.trim();
  if (trimmed === "") return null;
  try {
    const v = JSON.parse(trimmed);
    if (v === null || typeof v !== "object" || Array.isArray(v)) return null;
    return v as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseCsvStrings(s: string): string[] {
  return s
    .split(/[,\s]+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

export function GraphSkillAdminPanel() {
  return (
    <div className="space-y-4" data-testid="gs-panel">
      <ListVersionsCard />
      <CreatePackCard />
      <PublishVersionCard />
    </div>
  );
}

function ListVersionsCard() {
  const [skillKey, setSkillKey] = useState("");
  const formValid = skillKey.trim().length > 0;
  const query = trpc.agentStudio.graphSkill.listPackVersions.useQuery(
    formValid ? { skillKey: skillKey.trim() } : (undefined as never),
    { enabled: formValid, refetchOnWindowFocus: false },
  );

  const rows = ((query.data as { rows?: Array<unknown> } | undefined)?.rows ??
    []) as Array<{
    id: number;
    version: string;
    createdAt?: Date | string;
    hasSourceNoteRef?: boolean;
  }>;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionLabel>List pack versions</SectionLabel>
        <div>
          <Label htmlFor="gs-list-key">Skill key</Label>
          <Input
            id="gs-list-key"
            data-testid="gs-list-skill-key"
            value={skillKey}
            onChange={(e) => setSkillKey(e.target.value)}
            placeholder="e.g. graph_skill.entity_disambiguation"
            maxLength={100}
          />
        </div>
        {formValid ? (
          query.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : query.error ? (
            <p
              className="text-sm text-destructive"
              data-testid="gs-list-error"
            >
              {query.error.message}
            </p>
          ) : rows.length === 0 ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="gs-list-empty"
            >
              No versions for this skillKey.
            </p>
          ) : (
            <ul className="space-y-1" data-testid="gs-list-rows">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="rounded border bg-background p-2 font-mono text-xs"
                  data-testid="gs-list-row"
                >
                  #{r.id} v{r.version}
                  {r.hasSourceNoteRef ? " · note-ref" : ""}
                </li>
              ))}
            </ul>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}

function CreatePackCard() {
  const [skillKey, setSkillKey] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [domain, setDomain] = useState("");
  const [nodeTypes, setNodeTypes] = useState("");
  const [edgeTypes, setEdgeTypes] = useState("");
  const [riskLevel, setRiskLevel] = useState<RiskLevel | "">("");
  const [approvalRequired, setApprovalRequired] = useState(false);

  const utils = trpc.useUtils();
  const skillKeyValid =
    skillKey.trim().length > 0 &&
    /^[a-z0-9][a-z0-9._-]*$/.test(skillKey.trim());
  const formValid = skillKeyValid && name.trim().length > 0;

  const mut = trpc.agentStudio.graphSkill.createPack.useMutation({
    onSuccess: () => {
      toast.success(`Pack ${skillKey.trim()} created`);
      void utils.agentStudio.graphSkill.listPackVersions.invalidate();
      setSkillKey("");
      setName("");
      setDescription("");
      setDomain("");
      setNodeTypes("");
      setEdgeTypes("");
      setRiskLevel("");
      setApprovalRequired(false);
    },
    onError: (err) =>
      toast.error(`Create pack failed: ${err.message ?? "unknown"}`),
  });

  function handleCreate() {
    if (!formValid) return;
    const nodes = parseCsvStrings(nodeTypes);
    const edges = parseCsvStrings(edgeTypes);
    mut.mutate({
      skillKey: skillKey.trim(),
      name: name.trim(),
      ...(description.trim() !== "" ? { description: description.trim() } : {}),
      ...(domain.trim() !== "" ? { domain: domain.trim() } : {}),
      ...(nodes.length > 0 ? { supportedNodeTypeKeys: nodes } : {}),
      ...(edges.length > 0 ? { supportedEdgeTypeKeys: edges } : {}),
      ...(riskLevel !== "" ? { riskLevel: riskLevel as RiskLevel } : {}),
      ...(approvalRequired ? { approvalRequired: true } : {}),
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionLabel>Create pack</SectionLabel>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="gs-cp-key">Skill key</Label>
            <Input
              id="gs-cp-key"
              data-testid="gs-cp-skill-key"
              value={skillKey}
              onChange={(e) => setSkillKey(e.target.value)}
              placeholder="lowercase.alphanumeric"
              maxLength={100}
            />
            {!skillKeyValid && skillKey.length > 0 ? (
              <p
                className="mt-1 text-xs text-destructive"
                data-testid="gs-cp-key-error"
              >
                Must match [a-z0-9][a-z0-9._-]*
              </p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="gs-cp-name">Name</Label>
            <Input
              id="gs-cp-name"
              data-testid="gs-cp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={255}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="gs-cp-desc">Description (optional)</Label>
            <Input
              id="gs-cp-desc"
              data-testid="gs-cp-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
            />
          </div>
          <div>
            <Label htmlFor="gs-cp-domain">Domain (optional)</Label>
            <Input
              id="gs-cp-domain"
              data-testid="gs-cp-domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              maxLength={100}
            />
          </div>
          <div>
            <Label htmlFor="gs-cp-risk">Risk level (optional)</Label>
            <select
              id="gs-cp-risk"
              data-testid="gs-cp-risk"
              className="w-full rounded border bg-background p-2 text-sm"
              value={riskLevel}
              onChange={(e) => setRiskLevel(e.target.value as RiskLevel | "")}
            >
              <option value="">(unset)</option>
              {RISK_LEVELS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="gs-cp-nodes">Supported node typeKeys (CSV)</Label>
            <Input
              id="gs-cp-nodes"
              data-testid="gs-cp-node-types"
              value={nodeTypes}
              onChange={(e) => setNodeTypes(e.target.value)}
              placeholder="e.g. Note, Concept, Entity"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="gs-cp-edges">Supported edge typeKeys (CSV)</Label>
            <Input
              id="gs-cp-edges"
              data-testid="gs-cp-edge-types"
              value={edgeTypes}
              onChange={(e) => setEdgeTypes(e.target.value)}
              placeholder="e.g. REFERENCES, IMPLEMENTS"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            data-testid="gs-cp-approval-required"
            checked={approvalRequired}
            onChange={(e) => setApprovalRequired(e.target.checked)}
          />
          Approval required
        </label>
        <Button
          type="button"
          disabled={!formValid || mut.isPending}
          onClick={handleCreate}
          data-testid="gs-cp-button"
        >
          {mut.isPending ? "Creating…" : "Create pack"}
        </Button>
      </CardContent>
    </Card>
  );
}

function PublishVersionCard() {
  const [skillKey, setSkillKey] = useState("");
  const [version, setVersion] = useState("");
  const [manifest, setManifest] = useState("{}");
  const [changelog, setChangelog] = useState("");
  const [sourceNoteVersionId, setSourceNoteVersionId] = useState("");

  const utils = trpc.useUtils();
  const versionValid =
    version.trim().length > 0 &&
    /^[a-zA-Z0-9][a-zA-Z0-9._+-]*$/.test(version.trim());
  const parsedManifest = parseJsonRecord(manifest);
  const parsedSourceNoteVer =
    sourceNoteVersionId.trim() === ""
      ? undefined
      : parsePositiveInt(sourceNoteVersionId);
  const sourceValid =
    sourceNoteVersionId.trim() === "" ||
    (parsedSourceNoteVer !== null && parsedSourceNoteVer !== undefined);
  const formValid =
    skillKey.trim().length > 0 &&
    versionValid &&
    parsedManifest !== null &&
    sourceValid;

  const mut = trpc.agentStudio.graphSkill.publishVersion.useMutation({
    onSuccess: () => {
      toast.success(`Published ${skillKey.trim()} v${version.trim()}`);
      void utils.agentStudio.graphSkill.listPackVersions.invalidate();
      setVersion("");
      setManifest("{}");
      setChangelog("");
      setSourceNoteVersionId("");
    },
    onError: (err) => toast.error(`Publish failed: ${err.message ?? "unknown"}`),
  });

  function handlePublish() {
    if (!formValid) return;
    mut.mutate({
      skillKey: skillKey.trim(),
      version: version.trim(),
      manifest: parsedManifest as Record<string, unknown>,
      ...(changelog.trim() !== "" ? { changelog: changelog.trim() } : {}),
      ...(parsedSourceNoteVer !== undefined && parsedSourceNoteVer !== null
        ? { sourceNoteVersionId: parsedSourceNoteVer }
        : {}),
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionLabel>Publish version</SectionLabel>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="gs-pv-key">Skill key</Label>
            <Input
              id="gs-pv-key"
              data-testid="gs-pv-skill-key"
              value={skillKey}
              onChange={(e) => setSkillKey(e.target.value)}
              maxLength={100}
            />
          </div>
          <div>
            <Label htmlFor="gs-pv-version">Version</Label>
            <Input
              id="gs-pv-version"
              data-testid="gs-pv-version"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="e.g. 1.0.0 or 2026-05-11"
              maxLength={50}
            />
            {!versionValid && version.length > 0 ? (
              <p
                className="mt-1 text-xs text-destructive"
                data-testid="gs-pv-version-error"
              >
                Must match [a-zA-Z0-9][a-zA-Z0-9._+-]*
              </p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="gs-pv-source">
              Source note version id (optional)
            </Label>
            <Input
              id="gs-pv-source"
              data-testid="gs-pv-source-note-version"
              type="number"
              min={1}
              value={sourceNoteVersionId}
              onChange={(e) => setSourceNoteVersionId(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="gs-pv-manifest">Manifest (JSON object)</Label>
            <textarea
              id="gs-pv-manifest"
              data-testid="gs-pv-manifest"
              className="w-full rounded border bg-background p-2 font-mono text-xs"
              rows={6}
              value={manifest}
              onChange={(e) => setManifest(e.target.value)}
            />
            {parsedManifest === null ? (
              <p
                className="mt-1 text-xs text-destructive"
                data-testid="gs-pv-manifest-error"
              >
                Manifest must be a JSON object.
              </p>
            ) : null}
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="gs-pv-changelog">Changelog (optional)</Label>
            <textarea
              id="gs-pv-changelog"
              data-testid="gs-pv-changelog"
              className="w-full rounded border bg-background p-2 font-mono text-xs"
              rows={3}
              value={changelog}
              onChange={(e) => setChangelog(e.target.value)}
              maxLength={10000}
            />
          </div>
        </div>
        <Button
          type="button"
          disabled={!formValid || mut.isPending}
          onClick={handlePublish}
          data-testid="gs-pv-button"
        >
          {mut.isPending ? "Publishing…" : "Publish version"}
        </Button>
      </CardContent>
    </Card>
  );
}
