import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, Clock, TrendingDown } from "lucide-react";

interface ErrorCategory {
  name: string;
  count: number;
  percentage: number;
  color: string;
  priority: 'quick' | 'medium' | 'complex';
  estimate: string;
}

const errorData: ErrorCategory[] = [
  { name: 'Unused @ts-expect-error', count: 18, percentage: 18, color: '#10b981', priority: 'quick', estimate: '15 min' },
  { name: 'Missing TRPCError Import', count: 9, percentage: 9, color: '#10b981', priority: 'quick', estimate: '10 min' },
  { name: 'Date Conversions', count: 6, percentage: 6, color: '#f59e0b', priority: 'medium', estimate: '15 min' },
  { name: 'Number Conversions', count: 3, percentage: 3, color: '#f59e0b', priority: 'medium', estimate: '10 min' },
  { name: 'Missing Exports', count: 7, percentage: 7, color: '#f59e0b', priority: 'medium', estimate: '20 min' },
  { name: 'Complex Issues', count: 49, percentage: 49, color: '#ef4444', priority: 'complex', estimate: '90+ min' },
  { name: 'Wrong Argument Count', count: 5, percentage: 5, color: '#ef4444', priority: 'complex', estimate: '20 min' },
  { name: 'Iterator Downlevel', count: 3, percentage: 3, color: '#ef4444', priority: 'complex', estimate: '15 min' },
];

const phases = [
  {
    name: 'Phase 1: Quick Wins',
    errors: 27,
    estimate: '25 minutes',
    categories: ['Unused @ts-expect-error (18)', 'Missing TRPCError Import (9)'],
    color: 'bg-green-500',
    icon: CheckCircle,
  },
  {
    name: 'Phase 2: Type Conversions',
    errors: 9,
    estimate: '25 minutes',
    categories: ['Date Conversions (6)', 'Number Conversions (3)'],
    color: 'bg-yellow-500',
    icon: Clock,
  },
  {
    name: 'Phase 3: Missing Exports',
    errors: 7,
    estimate: '20 minutes',
    categories: ['Missing type exports (7)'],
    color: 'bg-orange-500',
    icon: AlertCircle,
  },
  {
    name: 'Phase 4: Complex Issues',
    errors: 57,
    estimate: '90+ minutes',
    categories: ['Drizzle inserts (14)', 'Object literals (10+)', 'Type predicates (3)', 'Others (30+)'],
    color: 'bg-red-500',
    icon: TrendingDown,
  },
];

const topFiles = [
  { name: 'agents.ts', errors: 14, category: 'Drizzle insert issues' },
  { name: 'agents-control-plane.ts', errors: 12, category: 'Unused directives + date conversions' },
  { name: 'embedded-runtime.ts', errors: 9, category: 'Unused directives + TRPCError imports' },
  { name: 'autonomous-remediation.ts', errors: 8, category: 'TRPCError imports + object literals' },
  { name: 'agents-promotions.ts', errors: 8, category: 'Type conversions + array issues' },
];

export default function ErrorAnalysisDashboard() {
  const totalErrors = 100;
  const quickWins = 27;
  const mediumPriority = 16;
  const complexIssues = 57;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold text-white">TypeScript Error Analysis</h1>
          <p className="text-slate-400">Deep root cause analysis of 100 TypeScript compilation errors</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-400">Total Errors</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">{totalErrors}</div>
              <p className="text-xs text-slate-500 mt-1">Across 25+ files</p>
            </CardContent>
          </Card>

          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-400">Quick Wins</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-500">{quickWins}</div>
              <p className="text-xs text-slate-500 mt-1">~25 minutes</p>
            </CardContent>
          </Card>

          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-400">Medium Priority</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-yellow-500">{mediumPriority}</div>
              <p className="text-xs text-slate-500 mt-1">~45 minutes</p>
            </CardContent>
          </Card>

          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-400">Complex Issues</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-500">{complexIssues}</div>
              <p className="text-xs text-slate-500 mt-1">~90+ minutes</p>
            </CardContent>
          </Card>
        </div>

        {/* Error Distribution */}
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">Error Distribution by Root Cause</CardTitle>
            <CardDescription className="text-slate-400">
              Errors grouped by underlying issue type
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {errorData.map((category) => (
                <div key={category.name} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: category.color }}
                      />
                      <span className="text-white font-medium">{category.name}</span>
                      <Badge
                        variant="outline"
                        className={
                          category.priority === 'quick'
                            ? 'border-green-500 text-green-500'
                            : category.priority === 'medium'
                            ? 'border-yellow-500 text-yellow-500'
                            : 'border-red-500 text-red-500'
                        }
                      >
                        {category.priority}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-slate-400 text-sm">{category.estimate}</span>
                      <span className="text-white font-bold">{category.count}</span>
                    </div>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-2">
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{
                        width: `${category.percentage}%`,
                        backgroundColor: category.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Fix Priority Plan */}
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">Fix Priority Plan</CardTitle>
            <CardDescription className="text-slate-400">
              Recommended order of operations for maximum impact
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {phases.map((phase, index) => {
                const Icon = phase.icon;
                return (
                  <Card key={index} className="bg-slate-900 border-slate-700">
                    <CardHeader>
                      <div className="flex items-center gap-3">
                        <div className={`${phase.color} p-2 rounded-lg`}>
                          <Icon className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <CardTitle className="text-white text-base">{phase.name}</CardTitle>
                          <CardDescription className="text-slate-400 text-sm">
                            {phase.errors} errors • {phase.estimate}
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-1">
                        {phase.categories.map((cat, i) => (
                          <li key={i} className="text-slate-300 text-sm flex items-start gap-2">
                            <span className="text-slate-500">•</span>
                            <span>{cat}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Top Problem Files */}
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">Top Problem Files</CardTitle>
            <CardDescription className="text-slate-400">
              Files with the most TypeScript errors
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topFiles.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-slate-900 rounded-lg border border-slate-700"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center text-white font-bold">
                      {index + 1}
                    </div>
                    <div>
                      <div className="text-white font-medium">{file.name}</div>
                      <div className="text-slate-400 text-sm">{file.category}</div>
                    </div>
                  </div>
                  <Badge variant="destructive" className="bg-red-500">
                    {file.errors} errors
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Progress Tracking */}
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">Progress Tracking</CardTitle>
            <CardDescription className="text-slate-400">
              Error reduction milestones
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Initial State</span>
                <span className="text-white font-bold">189 errors</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-300">After Missing Properties Fix</span>
                <span className="text-green-500 font-bold">115 errors (-39%)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-300">After Drizzle Fixes</span>
                <span className="text-green-500 font-bold">100 errors (-47%)</span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-3 mt-4">
                <div
                  className="bg-gradient-to-r from-green-500 to-emerald-500 h-3 rounded-full transition-all"
                  style={{ width: '47%' }}
                />
              </div>
              <p className="text-center text-slate-400 text-sm mt-2">
                47% reduction achieved • 53 errors remaining to reach zero
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
