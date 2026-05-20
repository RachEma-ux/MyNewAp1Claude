// GoldenQuestionsSuiteBrowserPanel — no-deferral continuation-34 slice 135.
//
// Closes the UI-consumer gap for goldenQuestions.listQuestionsInSuite —
// the only unconsumed endpoint on the goldenQuestions router. Pairs
// with the existing listSuites consumer to drive a suite-key dropdown
// → question table.

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { SectionLabel } from "./ui";

export function GoldenQuestionsSuiteBrowserPanel() {
  const [suiteKey, setSuiteKey] = useState<string>("");

  const suitesQuery = trpc.agentStudio.goldenQuestions.listSuites.useQuery(
    undefined,
    { refetchOnWindowFocus: false },
  );
  const suites = suitesQuery.data?.suites ?? [];

  const enabled = suiteKey.trim().length > 0;
  const questionsQuery =
    trpc.agentStudio.goldenQuestions.listQuestionsInSuite.useQuery(
      enabled ? { suiteKey } : (undefined as never),
      { enabled, refetchOnWindowFocus: false },
    );

  const envelope = questionsQuery.data as
    | {
        status: "ok";
        suiteKey: string;
        questions: Array<{
          questionKey?: string;
          prompt: string;
          expectedAnswer?: string | null;
          [k: string]: unknown;
        }>;
      }
    | { status: "not_found"; suiteKey: string }
    | undefined;

  return (
    <Card>
      <CardContent
        className="space-y-3 p-4"
        data-testid="gq-suite-browser-panel"
      >
        <SectionLabel>Suite browser</SectionLabel>
        <div>
          <label
            className="block text-xs font-medium"
            htmlFor="gq-sb-suite"
          >
            Suite
          </label>
          <select
            id="gq-sb-suite"
            data-testid="gq-sb-suite"
            className="w-full rounded border bg-background p-2 text-sm"
            value={suiteKey}
            onChange={(e) => setSuiteKey(e.target.value)}
          >
            <option value="">(select a suite)</option>
            {suites.map((s: { suiteKey: string; name?: string }) => (
              <option key={s.suiteKey} value={s.suiteKey}>
                {s.name ?? s.suiteKey}
              </option>
            ))}
          </select>
        </div>
        {!enabled ? (
          <p className="text-sm text-muted-foreground">
            Select a suite to browse questions.
          </p>
        ) : questionsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : questionsQuery.error ? (
          <p
            className="text-sm text-destructive"
            data-testid="gq-sb-error"
          >
            {questionsQuery.error.message}
          </p>
        ) : envelope?.status === "not_found" ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="gq-sb-not-found"
          >
            Suite "{envelope.suiteKey}" not found.
          </p>
        ) : envelope?.status === "ok" ? (
          envelope.questions.length === 0 ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="gq-sb-empty"
            >
              No questions in suite "{envelope.suiteKey}".
            </p>
          ) : (
            <ul className="space-y-1" data-testid="gq-sb-rows">
              {envelope.questions.map((q, i) => (
                <li
                  key={(q.questionKey as string) ?? `${envelope.suiteKey}-${i}`}
                  className="rounded border bg-background p-2 text-xs"
                  data-testid="gq-sb-row"
                >
                  <div className="font-mono">
                    {(q.questionKey as string) ?? `#${i + 1}`}
                  </div>
                  <div className="mt-1">{q.prompt}</div>
                  {q.expectedAnswer ? (
                    <div className="mt-1 text-muted-foreground">
                      → {q.expectedAnswer}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}
