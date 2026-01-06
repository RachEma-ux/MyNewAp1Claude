import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Shield, CheckCircle2, AlertTriangle, XCircle, TrendingUp, Activity } from "lucide-react";

export default function AgentDashboardPage() {
  const { data: agents, isLoading } = trpc.agents.list.useQuery();

  if (isLoading) {
    return (
      <div className="container py-8">
        <div className="text-center">Loading dashboard...</div>
      </div>
    );
  }

  const agentList = agents || [];

  // Calculate metrics
  const totalAgents = agentList.length;
  const sandboxAgents = agentList.filter((a: any) => a.mode === "sandbox").length;
  const governedAgents = agentList.filter((a: any) => a.mode === "governed").length;
  const validAgents = agentList.filter((a: any) => a.governanceStatus === "GOVERNED_VALID").length;
  const invalidatedAgents = agentList.filter((a: any) => a.governanceStatus === "GOVERNED_INVALIDATED").length;
  const restrictedAgents = agentList.filter((a: any) => a.governanceStatus === "GOVERNED_RESTRICTED").length;

  const promotionSuccessRate = governedAgents > 0 ? ((validAgents / governedAgents) * 100).toFixed(1) : "0";
  const complianceRate = totalAgents > 0 ? ((validAgents / totalAgents) * 100).toFixed(1) : "0";

  // Chart data
  const distributionData = [
    { name: "Sandbox", value: sandboxAgents, color: "#3b82f6" },
    { name: "Governed", value: governedAgents, color: "#10b981" },
  ];

  const statusData = [
    { name: "Valid", value: validAgents, color: "#10b981" },
    { name: "Invalidated", value: invalidatedAgents, color: "#ef4444" },
    { name: "Restricted", value: restrictedAgents, color: "#f59e0b" },
    { name: "Sandbox", value: sandboxAgents, color: "#3b82f6" },
  ];

  const roleClassData = agentList.reduce((acc: any[], agent: any) => {
    const existing = acc.find((item) => item.name === agent.roleClass);
    if (existing) {
      existing.value += 1;
    } else {
      acc.push({ name: agent.roleClass || "Unspecified", value: 1 });
    }
    return acc;
  }, []);

  return (
    <div className="container py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Agent Governance Dashboard</h1>
        <p className="text-muted-foreground">
          Monitor agent distribution, promotion success rates, and policy compliance metrics
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Agents</p>
              <p className="text-3xl font-bold mt-1">{totalAgents}</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
              <Activity className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Governed Agents</p>
              <p className="text-3xl font-bold mt-1">{governedAgents}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {totalAgents > 0 ? ((governedAgents / totalAgents) * 100).toFixed(0) : 0}% of total
              </p>
            </div>
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
              <Shield className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Promotion Success</p>
              <p className="text-3xl font-bold mt-1">{promotionSuccessRate}%</p>
              <p className="text-xs text-muted-foreground mt-1">
                {validAgents} / {governedAgents} valid
              </p>
            </div>
            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-emerald-600" />
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Policy Compliance</p>
              <p className="text-3xl font-bold mt-1">{complianceRate}%</p>
              <p className="text-xs text-muted-foreground mt-1">
                {validAgents} compliant
              </p>
            </div>
            <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Agent Distribution */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Agent Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={distributionData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ${value}`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {distributionData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        {/* Governance Status */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Governance Status</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={statusData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#8884d8">
                {statusData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Role Class Distribution */}
      {roleClassData.length > 0 && (
        <Card className="p-6 mb-8">
          <h3 className="text-lg font-semibold mb-4">Agents by Role Class</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={roleClassData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="value" fill="#6366f1" name="Agent Count" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Status Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Valid</p>
              <p className="text-2xl font-bold">{validAgents}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
              <Activity className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Sandbox</p>
              <p className="text-2xl font-bold">{sandboxAgents}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
              <XCircle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Invalidated</p>
              <p className="text-2xl font-bold">{invalidatedAgents}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Restricted</p>
              <p className="text-2xl font-bold">{restrictedAgents}</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
