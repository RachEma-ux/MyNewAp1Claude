import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import {
  MessageSquare,
  FolderOpen,
  Database,
  Bot,
  Package,
  Plus,
  ArrowRight,
  Cpu,
  HardDrive,
  Zap,
} from "lucide-react";

// Version: 2025-01-04 - Agent Creation Wizard Fix
export default function Home() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { data: workspaces, isLoading: workspacesLoading } = trpc.workspaces.list.useQuery();
  const { data: models, isLoading: modelsLoading } = trpc.models.list.useQuery({});

  const stats = [
    {
      title: "Workspaces",
      value: workspaces?.length || 0,
      icon: <FolderOpen className="h-5 w-5" />,
      href: "/workspaces",
      color: "text-blue-500",
    },
    {
      title: "Models",
      value: models?.length || 0,
      icon: <Package className="h-5 w-5" />,
      href: "/models",
      color: "text-green-500",
    },
    {
      title: "Agents",
      value: 0,
      icon: <Bot className="h-5 w-5" />,
      href: "/agents",
      color: "text-purple-500",
    },
    {
      title: "Documents",
      value: 0,
      icon: <Database className="h-5 w-5" />,
      href: "/documents",
      color: "text-orange-500",
    },
  ];

  const quickActions = [
    {
      title: "Start New Chat",
      description: "Begin a conversation with an AI agent",
      icon: <MessageSquare className="h-6 w-6" />,
      href: "/chat",
      color: "bg-blue-500/10 text-blue-500",
    },
    {
      title: "Create Workspace",
      description: "Set up a new project workspace",
      icon: <FolderOpen className="h-6 w-6" />,
      href: "/workspaces",
      color: "bg-green-500/10 text-green-500",
    },
    {
      title: "Upload Documents",
      description: "Add documents to your knowledge base",
      icon: <Database className="h-6 w-6" />,
      href: "/documents",
      color: "bg-purple-500/10 text-purple-500",
    },
    {
      title: "Download Models",
      description: "Browse and download AI models",
      icon: <Package className="h-6 w-6" />,
      href: "/models",
      color: "bg-orange-500/10 text-orange-500",
    },
  ];

  const systemInfo = [
    { label: "CPU", value: "Available", icon: <Cpu className="h-4 w-4" /> },
    { label: "GPU", value: "Not Detected", icon: <Zap className="h-4 w-4" /> },
    { label: "Storage", value: "Unlimited", icon: <HardDrive className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Welcome back, {user?.name || "User"}
        </h1>
        <p className="text-muted-foreground mt-2">
          Your local AI development platform is ready. All processing happens on your machine with complete privacy.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card 
            key={stat.title} 
            className="hover:bg-accent/50 transition-colors cursor-pointer"
            onClick={() => setLocation(stat.href)}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <div className={stat.color}>{stat.icon}</div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground mt-1">
                View all {stat.title.toLowerCase()}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-2xl font-semibold mb-4">Quick Actions</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {quickActions.map((action) => (
            <Card 
              key={action.title} 
              className="hover:bg-accent/50 transition-colors cursor-pointer"
              onClick={() => setLocation(action.href)}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`p-2 rounded-lg ${action.color}`}>
                      {action.icon}
                    </div>
                    <div>
                      <CardTitle className="text-lg">{action.title}</CardTitle>
                      <CardDescription className="mt-1">
                        {action.description}
                      </CardDescription>
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>

      {/* System Information */}
      <Card>
        <CardHeader>
          <CardTitle>System Information</CardTitle>
          <CardDescription>
            Local hardware status and resource availability
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {systemInfo.map((info) => (
              <div key={info.label} className="flex items-center space-x-3 p-3 rounded-lg bg-accent/50">
                <div className="text-muted-foreground">{info.icon}</div>
                <div>
                  <p className="text-sm font-medium">{info.label}</p>
                  <p className="text-xs text-muted-foreground">{info.value}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Getting Started */}
      {(!workspaces || workspaces.length === 0) && (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle>Get Started</CardTitle>
            <CardDescription>
              Create your first workspace to begin working with AI models and documents
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setLocation("/workspaces")}>
              <Plus className="mr-2 h-4 w-4" />
              Create Your First Workspace
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
