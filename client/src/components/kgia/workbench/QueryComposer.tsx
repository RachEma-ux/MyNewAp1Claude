import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Send } from "lucide-react";

interface QueryComposerProps {
  question: string;
  onQuestionChange: (q: string) => void;
  mode: string;
  onModeChange: (m: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  sourceCount: number;
}

export default function QueryComposer({
  question, onQuestionChange, mode, onModeChange, onSubmit, isLoading, sourceCount,
}: QueryComposerProps) {
  return (
    <div className="p-4 border-b border-border space-y-3 shrink-0">
      <div className="flex gap-2">
        <Input
          placeholder="Ask a question about your knowledge graph..."
          value={question}
          onChange={(e) => onQuestionChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && onSubmit()}
          disabled={isLoading}
          className="flex-1"
        />
        <Button onClick={onSubmit} disabled={isLoading || !question.trim()} size="sm">
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
      <div className="flex gap-2 items-center">
        <Select value={mode} onValueChange={onModeChange}>
          <SelectTrigger className="w-40 h-7 text-xs">
            <SelectValue placeholder="Mode" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto</SelectItem>
            <SelectItem value="direct_query">Direct Query</SelectItem>
            <SelectItem value="hybrid">Hybrid</SelectItem>
            <SelectItem value="graph_rag">Graph RAG</SelectItem>
            <SelectItem value="memory">Memory</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {sourceCount} source{sourceCount !== 1 ? "s" : ""} available
        </span>
      </div>
    </div>
  );
}
