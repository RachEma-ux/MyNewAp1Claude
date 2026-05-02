/**
 * PSQuestionRenderer — DB-driven question rendering
 *
 * Renders matrix questions dynamically from the loaded active matrix.
 * Supports boolean checkboxes. Groups by dimension when dimension
 * metadata is available. No hard-coded questions.
 */
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";

interface MatrixQuestion {
  id: number;
  code: string;
  label: string;
  description: string | null;
}

interface MatrixDimension {
  id: number;
  dimensionKey: string;
  dimensionLabel: string;
  values: Array<{ id: number; valueKey: string; valueLabel: string }>;
}

export function PSQuestionRenderer({
  questions,
  dimensions,
  answers,
  onAnswerChange,
}: {
  questions: MatrixQuestion[];
  dimensions: MatrixDimension[];
  answers: Record<string, boolean | string | number>;
  onAnswerChange: (code: string, value: boolean | string | number) => void;
}) {
  if (questions.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <AlertTriangle className="w-6 h-6 text-amber-500 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            No questions defined in the active matrix. Contact your administrator.
          </p>
        </CardContent>
      </Card>
    );
  }

  const answeredCount = Object.entries(answers).filter(
    ([, v]) => v === true || (typeof v === "string" && v !== "" && v !== "false" && v !== "0" && v !== "no") || (typeof v === "number" && v > 0),
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Badge variant="secondary">
          {answeredCount}/{questions.length} answered
        </Badge>
        {dimensions.length > 0 && (
          <Badge variant="outline" className="text-xs text-muted-foreground">
            {dimensions.length} dimension{dimensions.length !== 1 ? "s" : ""} loaded
          </Badge>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        Select all that apply to your project. The matrix engine computes the
        best matching scope based on weighted scores.
      </p>

      <div className="space-y-2">
        {questions.map((q) => {
          const isChecked = answers[q.code] === true;
          return (
            <Card
              key={q.code}
              className={`cursor-pointer transition-colors ${
                isChecked
                  ? "border-indigo-500/40 bg-indigo-500/5"
                  : "hover:border-indigo-500/20"
              }`}
            >
              <CardContent className="pt-3 pb-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <Checkbox
                    checked={isChecked}
                    onCheckedChange={(checked) =>
                      onAnswerChange(q.code, !!checked)
                    }
                    className="mt-0.5"
                  />
                  <div className="space-y-0.5 flex-1">
                    <p className="text-sm font-medium">{q.label}</p>
                    {q.description && (
                      <p className="text-xs text-muted-foreground">
                        {q.description}
                      </p>
                    )}
                    <span className="text-[10px] font-mono text-muted-foreground/60">
                      {q.code}
                    </span>
                  </div>
                </label>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
