/**
 * RAC P11 — Retrieval policy editor for a profile.
 *
 * Reads `agentStudio.racSources.policy.get` and writes via `policy.upsert`.
 * The policy controls the P4 filter (minScore, maxChunks, dedupeBy,
 * freshness, citation enforcement, PII/license verdicts) and the P5
 * timeout. Empty inputs map to `null` so server-side defaults apply
 * (D-RET-3 default policy).
 */

import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { LoadingState, EmptyState, SectionLabel } from "./ui";

const VERDICTS = ["none", "warn", "block"] as const;
type Verdict = (typeof VERDICTS)[number];

interface Props {
  workspaceId: number;
  profileId: number | null;
}

interface PolicyForm {
  minScore: string;
  maxChunks: string;
  dedupeBy: string;
  freshnessMaxAgeDays: string;
  citationRequired: boolean;
  sourcePermissionFilter: string;
  piiPolicy: Verdict;
  licensePolicy: Verdict;
  timeoutMs: string;
}

const EMPTY: PolicyForm = {
  minScore: "",
  maxChunks: "",
  dedupeBy: "",
  freshnessMaxAgeDays: "",
  citationRequired: false,
  sourcePermissionFilter: "",
  piiPolicy: "none",
  licensePolicy: "none",
  timeoutMs: "",
};

function nullableNumber(s: string): number | null | undefined {
  if (!s.trim()) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function nullableString(s: string): string | null | undefined {
  return s.trim() ? s : null;
}

export default function RacRetrievalPolicyPanel({ workspaceId, profileId }: Props) {
  const enabled = profileId != null && profileId > 0;
  const utils = trpc.useUtils();
  const policyQuery = trpc.agentStudio.racSources.policy.get.useQuery(
    { profileId: profileId ?? -1 },
    { enabled },
  );
  const upsertMut = trpc.agentStudio.racSources.policy.upsert.useMutation({
    onSuccess: () => {
      toast.success("Policy saved");
      if (profileId) {
        void utils.agentStudio.racSources.policy.get.invalidate({ profileId });
      }
    },
    onError: (e) => toast.error(e.message),
  });
  const [form, setForm] = useState<PolicyForm>(EMPTY);

  useEffect(() => {
    const p = policyQuery.data as Record<string, unknown> | null | undefined;
    if (!p) {
      setForm(EMPTY);
      return;
    }
    setForm({
      minScore: p.minScore == null ? "" : String(p.minScore),
      maxChunks: p.maxChunks == null ? "" : String(p.maxChunks),
      dedupeBy: typeof p.dedupeBy === "string" ? p.dedupeBy : "",
      freshnessMaxAgeDays:
        p.freshnessMaxAgeDays == null ? "" : String(p.freshnessMaxAgeDays),
      citationRequired: Boolean(p.citationRequired),
      sourcePermissionFilter:
        typeof p.sourcePermissionFilter === "string" ? p.sourcePermissionFilter : "",
      piiPolicy: (p.piiPolicy as Verdict) ?? "none",
      licensePolicy: (p.licensePolicy as Verdict) ?? "none",
      timeoutMs: p.timeoutMs == null ? "" : String(p.timeoutMs),
    });
  }, [policyQuery.data]);

  if (!enabled) {
    return (
      <EmptyState
        title="Pick a profile to edit its policy"
        description="Retrieval policies are scoped per profile (P0.5 D-RET-3)."
      />
    );
  }
  if (policyQuery.isLoading) return <LoadingState label="Loading policy…" />;

  const setField = <K extends keyof PolicyForm>(key: K, val: PolicyForm[K]) =>
    setForm((f) => ({ ...f, [key]: val }));

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <SectionLabel>Retrieval policy</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Min score (0–1)</Label>
            <Input
              type="number"
              step="0.01"
              min={0}
              max={1}
              value={form.minScore}
              onChange={(e) => setField("minScore", e.target.value)}
              className="h-8 text-xs"
              placeholder="default"
            />
          </div>
          <div>
            <Label className="text-xs">Max chunks</Label>
            <Input
              type="number"
              min={1}
              value={form.maxChunks}
              onChange={(e) => setField("maxChunks", e.target.value)}
              className="h-8 text-xs"
              placeholder="default"
            />
          </div>
          <div>
            <Label className="text-xs">Dedupe by</Label>
            <Input
              value={form.dedupeBy}
              onChange={(e) => setField("dedupeBy", e.target.value)}
              className="h-8 text-xs"
              placeholder="content_hash"
            />
          </div>
          <div>
            <Label className="text-xs">Freshness max age (days)</Label>
            <Input
              type="number"
              min={1}
              value={form.freshnessMaxAgeDays}
              onChange={(e) => setField("freshnessMaxAgeDays", e.target.value)}
              className="h-8 text-xs"
              placeholder="—"
            />
          </div>
          <div>
            <Label className="text-xs">Source permission filter</Label>
            <Input
              value={form.sourcePermissionFilter}
              onChange={(e) => setField("sourcePermissionFilter", e.target.value)}
              className="h-8 text-xs"
              placeholder="public"
            />
          </div>
          <div>
            <Label className="text-xs">Timeout (ms)</Label>
            <Input
              type="number"
              min={50}
              value={form.timeoutMs}
              onChange={(e) => setField("timeoutMs", e.target.value)}
              className="h-8 text-xs"
              placeholder="3000"
            />
          </div>
          <div>
            <Label className="text-xs">PII verdict</Label>
            <Select
              value={form.piiPolicy}
              onValueChange={(v) => setField("piiPolicy", v as Verdict)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VERDICTS.map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">License verdict</Label>
            <Select
              value={form.licensePolicy}
              onValueChange={(v) => setField("licensePolicy", v as Verdict)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VERDICTS.map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 flex items-center gap-2">
            <Switch
              checked={form.citationRequired}
              onCheckedChange={(v) => setField("citationRequired", !!v)}
              id="citation-required"
            />
            <Label htmlFor="citation-required" className="text-xs">
              Require citations
            </Label>
          </div>
        </div>
        <Button
          size="sm"
          onClick={() =>
            profileId &&
            upsertMut.mutate({
              workspaceId,
              profileId,
              minScore: nullableNumber(form.minScore),
              maxChunks: nullableNumber(form.maxChunks),
              dedupeBy: nullableString(form.dedupeBy),
              freshnessMaxAgeDays: nullableNumber(form.freshnessMaxAgeDays),
              citationRequired: form.citationRequired,
              sourcePermissionFilter: nullableString(form.sourcePermissionFilter),
              piiPolicy: form.piiPolicy === "none" ? null : form.piiPolicy,
              licensePolicy:
                form.licensePolicy === "none" ? null : form.licensePolicy,
              timeoutMs: nullableNumber(form.timeoutMs),
            })
          }
          disabled={upsertMut.isPending}
        >
          {upsertMut.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
          ) : (
            <Save className="h-3 w-3 mr-1" />
          )}
          Save policy
        </Button>
      </CardContent>
    </Card>
  );
}
