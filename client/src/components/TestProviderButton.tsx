import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Loader2, Play, CheckCircle, XCircle, Clock, Zap } from "lucide-react";
import { toast } from "sonner";

interface TestResult {
  success: boolean;
  latencyMs?: number;
  error?: string;
}

interface TestResults {
  health?: TestResult;
  completion?: TestResult;
  streaming?: TestResult;
  toolCalling?: TestResult;
}

interface Props {
  providerId: number;
  providerName: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
}

export function TestProviderButton({ providerId, providerName, variant = "outline", size = "sm" }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [testOptions, setTestOptions] = useState({
    testHealth: true,
    testCompletion: true,
    testStreaming: true,
    testToolCalling: false,
  });
  const [results, setResults] = useState<TestResults | null>(null);

  const runTest = trpc.providers.test.runFullTest.useMutation({
    onSuccess: (data) => {
      setResults(data.results as TestResults);
      if (data.success) {
        toast.success(`${providerName} passed all tests`);
      } else {
        toast.error(`${providerName} failed some tests`);
      }
    },
    onError: (error) => {
      toast.error(`Test failed: ${error.message}`);
    },
  });

  const handleRunTest = () => {
    setResults(null);
    runTest.mutate({
      providerId,
      testOptions,
    });
  };

  const getTestCount = () => {
    return Object.values(testOptions).filter(Boolean).length;
  };

  const getPassCount = () => {
    if (!results) return 0;
    return Object.values(results).filter(r => r?.success).length;
  };

  const getProgress = () => {
    if (!results) return 0;
    const total = getTestCount();
    const passed = getPassCount();
    return total > 0 ? (passed / total) * 100 : 0;
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size}>
          <Play className="h-4 w-4 mr-1" />
          Test
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Test Provider: {providerName}</DialogTitle>
          <DialogDescription>
            Run diagnostic tests to verify provider functionality
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Test Options */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Test Options</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center space-x-3">
                <Checkbox
                  id="test-health"
                  checked={testOptions.testHealth}
                  onCheckedChange={(checked) =>
                    setTestOptions({ ...testOptions, testHealth: !!checked })
                  }
                />
                <Label htmlFor="test-health" className="text-sm cursor-pointer">
                  Health Check - Verify provider is reachable
                </Label>
              </div>
              <div className="flex items-center space-x-3">
                <Checkbox
                  id="test-completion"
                  checked={testOptions.testCompletion}
                  onCheckedChange={(checked) =>
                    setTestOptions({ ...testOptions, testCompletion: !!checked })
                  }
                />
                <Label htmlFor="test-completion" className="text-sm cursor-pointer">
                  Completion Test - Simple generation request
                </Label>
              </div>
              <div className="flex items-center space-x-3">
                <Checkbox
                  id="test-streaming"
                  checked={testOptions.testStreaming}
                  onCheckedChange={(checked) =>
                    setTestOptions({ ...testOptions, testStreaming: !!checked })
                  }
                />
                <Label htmlFor="test-streaming" className="text-sm cursor-pointer">
                  Streaming Test - Token-by-token output
                </Label>
              </div>
              <div className="flex items-center space-x-3">
                <Checkbox
                  id="test-tools"
                  checked={testOptions.testToolCalling}
                  onCheckedChange={(checked) =>
                    setTestOptions({ ...testOptions, testToolCalling: !!checked })
                  }
                />
                <Label htmlFor="test-tools" className="text-sm cursor-pointer">
                  Tool Calling Test - Function calling support
                </Label>
              </div>
            </CardContent>
          </Card>

          {/* Run Button */}
          <Button
            onClick={handleRunTest}
            disabled={runTest.isPending || getTestCount() === 0}
            className="w-full"
          >
            {runTest.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Running {getTestCount()} tests...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-2" />
                Run {getTestCount()} Tests
              </>
            )}
          </Button>

          {/* Results */}
          {results && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Results</CardTitle>
                  <Badge variant={getPassCount() === getTestCount() ? "default" : "destructive"}>
                    {getPassCount()}/{getTestCount()} Passed
                  </Badge>
                </div>
                <Progress value={getProgress()} className="h-2" />
              </CardHeader>
              <CardContent className="space-y-3">
                {results.health && (
                  <TestResultRow
                    name="Health Check"
                    result={results.health}
                  />
                )}
                {results.completion && (
                  <TestResultRow
                    name="Completion"
                    result={results.completion}
                  />
                )}
                {results.streaming && (
                  <TestResultRow
                    name="Streaming"
                    result={results.streaming}
                  />
                )}
                {results.toolCalling && (
                  <TestResultRow
                    name="Tool Calling"
                    result={results.toolCalling}
                  />
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TestResultRow({ name, result }: { name: string; result: TestResult }) {
  return (
    <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
      <div className="flex items-center gap-2">
        {result.success ? (
          <CheckCircle className="h-4 w-4 text-green-500" />
        ) : (
          <XCircle className="h-4 w-4 text-red-500" />
        )}
        <span className="text-sm font-medium">{name}</span>
      </div>
      <div className="flex items-center gap-2">
        {result.latencyMs && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {result.latencyMs}ms
          </span>
        )}
        {result.error && (
          <span className="text-xs text-red-500 max-w-[150px] truncate" title={result.error}>
            {result.error}
          </span>
        )}
      </div>
    </div>
  );
}
