// RacIngestionPanel — no-deferral continuation-20 slice 93.
//
// Closes the UI-consumer gap for the racIngestion.* tRPC surface
// (RAC Phase 3 — 3-endpoint mixed query/mutation source-registration
// workflow: ingestPreview / registerIndexedSource / validateIndex).
//
// Shape — preview-then-commit. The same {workspaceId, sourceId}
// reference threads through all 3 endpoints:
//
//   1. Preview the source's first N chunks (sampleSize 1-50, default 5)
//      to confirm what will be indexed.
//   2. Register the indexed source — resolves embedding binding
//      (source-level → workspace default fallback, fail-closed),
//      stamps `embedding_model_pinned_at` if workspace-default was used.
//   3. Validate the index post-register — surfaces adapter health
//      + structured reasons (index_missing / embedding_dim_mismatch).

import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionLabel } from "./ui";

const SAMPLE_MIN = 1;
const SAMPLE_MAX = 50;
const SAMPLE_DEFAULT = 5;

function parsePositiveInt(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : null;
}

interface SourceRef {
  readonly workspaceId: number;
  readonly sourceId: number;
}

interface PreviewRef extends SourceRef {
  readonly sampleSize: number;
}

interface RegisterResultRow {
  readonly sourceId: number;
  readonly embeddingProviderConnectionId: number | null;
  readonly embeddingModelRef: string | null;
  readonly embeddingModelDim: number | null;
  readonly resolvedFrom: string;
  readonly registeredAt: number;
}

export function RacIngestionPanel() {
  const [workspaceId, setWorkspaceId] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [sampleSize, setSampleSize] = useState(String(SAMPLE_DEFAULT));
  const [previewRef, setPreviewRef] = useState<PreviewRef | null>(null);
  const [validateRef, setValidateRef] = useState<SourceRef | null>(null);
  const [registerResults, setRegisterResults] = useState<
    RegisterResultRow[]
  >([]);

  const parsedWorkspace = parsePositiveInt(workspaceId);
  const parsedSource = parsePositiveInt(sourceId);
  const parsedSample = parsePositiveInt(sampleSize);
  const sampleValid =
    parsedSample !== null &&
    parsedSample >= SAMPLE_MIN &&
    parsedSample <= SAMPLE_MAX;
  const formValid =
    parsedWorkspace !== null && parsedSource !== null && sampleValid;

  const previewQuery = trpc.agentStudio.racIngestion.ingestPreview.useQuery(
    previewRef !== null
      ? {
          workspaceId: previewRef.workspaceId,
          sourceId: previewRef.sourceId,
          sampleSize: previewRef.sampleSize,
        }
      : (undefined as never),
    { enabled: previewRef !== null, refetchOnWindowFocus: false },
  );

  const validateQuery = trpc.agentStudio.racIngestion.validateIndex.useQuery(
    validateRef !== null
      ? {
          workspaceId: validateRef.workspaceId,
          sourceId: validateRef.sourceId,
        }
      : (undefined as never),
    { enabled: validateRef !== null, refetchOnWindowFocus: false },
  );

  const registerMut =
    trpc.agentStudio.racIngestion.registerIndexedSource.useMutation({
      onSuccess: (res) => {
        toast.success(
          `Source #${res.sourceId} registered (${res.resolvedFrom})`,
        );
        setRegisterResults((prev) =>
          [
            {
              sourceId: res.sourceId,
              embeddingProviderConnectionId:
                res.embeddingProviderConnectionId ?? null,
              embeddingModelRef: res.embeddingModelRef ?? null,
              embeddingModelDim: res.embeddingModelDim ?? null,
              resolvedFrom: res.resolvedFrom,
              registeredAt: Date.now(),
            },
            ...prev,
          ].slice(0, 10),
        );
      },
      onError: (err) => {
        toast.error(`Register failed: ${err.message ?? "unknown"}`);
      },
    });

  function handleLoadPreview() {
    if (!formValid) return;
    setPreviewRef({
      workspaceId: parsedWorkspace as number,
      sourceId: parsedSource as number,
      sampleSize: parsedSample as number,
    });
  }

  function handleRegister() {
    if (!formValid) return;
    registerMut.mutate({
      workspaceId: parsedWorkspace as number,
      sourceId: parsedSource as number,
    });
  }

  function handleValidate() {
    if (!formValid) return;
    setValidateRef({
      workspaceId: parsedWorkspace as number,
      sourceId: parsedSource as number,
    });
  }

  const previewEnvelope = previewQuery.data ?? null;
  const validateEnvelope = validateQuery.data ?? null;

  return (
    <div className="space-y-4" data-testid="rac-ingestion-panel">
      <Card>
        <CardContent className="space-y-3 p-4">
          <SectionLabel>Source reference</SectionLabel>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="rac-ws-id">Workspace id</Label>
              <Input
                id="rac-ws-id"
                data-testid="rac-workspace-id"
                type="number"
                min={1}
                value={workspaceId}
                onChange={(e) => {
                  setWorkspaceId(e.target.value);
                  setPreviewRef(null);
                  setValidateRef(null);
                }}
                placeholder="e.g. 7"
              />
            </div>
            <div>
              <Label htmlFor="rac-source-id">Source id</Label>
              <Input
                id="rac-source-id"
                data-testid="rac-source-id"
                type="number"
                min={1}
                value={sourceId}
                onChange={(e) => {
                  setSourceId(e.target.value);
                  setPreviewRef(null);
                  setValidateRef(null);
                }}
                placeholder="e.g. 42"
              />
            </div>
            <div>
              <Label htmlFor="rac-sample-size">
                Sample size ({SAMPLE_MIN}–{SAMPLE_MAX})
              </Label>
              <Input
                id="rac-sample-size"
                data-testid="rac-sample-size"
                type="number"
                min={SAMPLE_MIN}
                max={SAMPLE_MAX}
                value={sampleSize}
                onChange={(e) => setSampleSize(e.target.value)}
              />
            </div>
          </div>
          {!formValid ? (
            <p className="text-xs text-muted-foreground">
              Workspace + source must be positive integers; sample size must
              be {SAMPLE_MIN}–{SAMPLE_MAX}.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <SectionLabel>Step 1 — Preview</SectionLabel>
          <Button
            type="button"
            disabled={!formValid || previewQuery.isLoading}
            onClick={handleLoadPreview}
            data-testid="rac-preview-button"
          >
            {previewQuery.isLoading ? "Loading…" : "Load preview"}
          </Button>
          {previewQuery.error ? (
            <p
              className="text-sm text-destructive"
              data-testid="rac-preview-error"
            >
              Preview failed: {previewQuery.error.message}
            </p>
          ) : null}
          {previewEnvelope ? (
            <div
              className="space-y-2 rounded border bg-muted/20 p-3"
              data-testid="rac-preview-result"
            >
              <div className="flex items-center gap-2 text-xs">
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono">
                  sourceType: {previewEnvelope.sourceType}
                </span>
                <span className="text-muted-foreground">
                  {previewEnvelope.sampleChunks.length} chunk
                  {previewEnvelope.sampleChunks.length === 1 ? "" : "s"}
                </span>
              </div>
              {previewEnvelope.warnings.length > 0 ? (
                <ul
                  className="space-y-1 text-xs text-amber-700 dark:text-amber-300"
                  data-testid="rac-preview-warnings"
                >
                  {previewEnvelope.warnings.map((w, i) => (
                    <li key={`${i}::${w}`}>⚠ {w}</li>
                  ))}
                </ul>
              ) : null}
              {previewEnvelope.sampleChunks.length === 0 ? (
                <p
                  className="text-xs text-muted-foreground"
                  data-testid="rac-preview-empty"
                >
                  Adapter returned no sample chunks for this source.
                </p>
              ) : (
                <ul
                  className="space-y-2"
                  data-testid="rac-preview-chunk-list"
                >
                  {previewEnvelope.sampleChunks.map((c, i) => (
                    <li
                      key={`${i}::${c.citation}`}
                      data-testid="rac-preview-chunk-row"
                      className="rounded border bg-background p-2 text-xs"
                    >
                      <p className="font-mono text-[10px] text-muted-foreground">
                        {c.citation}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap">{c.content}</p>
                      {c.metadata && Object.keys(c.metadata).length > 0 ? (
                        <pre className="mt-1 overflow-x-auto rounded bg-muted/40 p-1 font-mono text-[10px]">
                          {JSON.stringify(c.metadata)}
                        </pre>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <SectionLabel>Step 2 — Register indexed source</SectionLabel>
          <p className="text-xs text-muted-foreground">
            Resolves the embedding binding (source-level → workspace default
            fallback, fail-closed) and stamps{" "}
            <code className="font-mono">embedding_model_pinned_at</code> if the
            workspace default was used.
          </p>
          <Button
            type="button"
            disabled={
              !formValid || previewEnvelope === null || registerMut.isPending
            }
            onClick={handleRegister}
            data-testid="rac-register-button"
          >
            {registerMut.isPending ? "Registering…" : "Register source"}
          </Button>
          {previewEnvelope === null ? (
            <p className="text-xs text-muted-foreground">
              Load a preview first to enable registration.
            </p>
          ) : null}
          {registerResults.length > 0 ? (
            <ul
              className="space-y-1"
              data-testid="rac-register-results"
            >
              {registerResults.map((r) => (
                <li
                  key={r.registeredAt}
                  data-testid="rac-register-result-row"
                  className="rounded border bg-muted/20 p-2 font-mono text-xs"
                >
                  <p>
                    <span className="font-medium">#{r.sourceId}</span>{" "}
                    resolvedFrom={r.resolvedFrom}
                  </p>
                  {r.embeddingModelRef !== null ? (
                    <p className="text-muted-foreground">
                      model: {r.embeddingModelRef} (dim={r.embeddingModelDim};
                      conn=#{r.embeddingProviderConnectionId})
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <SectionLabel>Step 3 — Validate index</SectionLabel>
          <Button
            type="button"
            variant="outline"
            disabled={!formValid || validateQuery.isLoading}
            onClick={handleValidate}
            data-testid="rac-validate-button"
          >
            {validateQuery.isLoading ? "Validating…" : "Validate index"}
          </Button>
          {validateQuery.error ? (
            <p
              className="text-sm text-destructive"
              data-testid="rac-validate-error"
            >
              Validate failed: {validateQuery.error.message}
            </p>
          ) : null}
          {validateEnvelope ? (
            <div
              className="space-y-2 rounded border bg-muted/20 p-3 text-xs"
              data-testid="rac-validate-result"
            >
              <div className="flex items-center gap-2">
                <span
                  className={
                    "rounded px-1.5 py-0.5 font-medium " +
                    (validateEnvelope.ok
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                      : "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300")
                  }
                >
                  {validateEnvelope.ok ? "OK" : "NOT OK"}
                </span>
                {validateEnvelope.reason ? (
                  <span className="font-mono text-muted-foreground">
                    reason: {validateEnvelope.reason}
                  </span>
                ) : null}
              </div>
              <p className="font-mono text-muted-foreground">
                health: {String(validateEnvelope.health.status ?? "unknown")}
              </p>
              {validateEnvelope.details &&
              Object.keys(validateEnvelope.details).length > 0 ? (
                <pre
                  className="overflow-x-auto rounded bg-muted/40 p-1 font-mono text-[10px]"
                  data-testid="rac-validate-details"
                >
                  {JSON.stringify(validateEnvelope.details, null, 2)}
                </pre>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
