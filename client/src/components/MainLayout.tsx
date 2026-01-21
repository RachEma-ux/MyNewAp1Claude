import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { trpc } from "@/lib/trpc";
import {
  LayoutDashboard,
  MessageSquare,
  FolderOpen,
  Database,
  Bot,
  Settings,
  Zap,
  Package,
  Menu,
  X,
  LogOut,
  User,
  Cloud,
  BarChart3,
  MessagesSquare,
  FileText,
  Activity,
  ChevronDown,
  ChevronRight,
  Key,
  BookOpen,
  Wand2,
} from "lucide-react";

interface MainLayoutProps {
  children: ReactNode;
}

interface NavItem {
  label: string;
  icon: ReactNode;
  href?: string;
  children?: NavItem[];
}

export default function MainLayout({ children }: MainLayoutProps) {
  const [location] = useLocation();
  const { user } = useAuth();
  // Start closed on mobile, open on desktop
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [llmMenuOpen, setLlmMenuOpen] = useState(false);
  const [automationMenuOpen, setAutomationMenuOpen] = useState(false);
  const [infrastructureMenuOpen, setInfrastructureMenuOpen] = useState(false);
  const [agentsMenuOpen, setAgentsMenuOpen] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [hardwareMenuOpen, setHardwareMenuOpen] = useState(false);
  const [softwareMenuOpen, setSoftwareMenuOpen] = useState(false);
  const logoutMutation = trpc.auth.logout.useMutation();

  const handleLogout = async () => {
    await logoutMutation.mutateAsync();
    window.location.href = "/";
  };

  const navItems: NavItem[] = [
    { label: "Dashboard", icon: <LayoutDashboard className="w-5 h-5" />, href: "/" },
    { label: "Chat", icon: <MessageSquare className="w-5 h-5" />, href: "/chat" },
    { label: "Conversations", icon: <MessagesSquare className="w-5 h-5" />, href: "/conversations" },
    { label: "Workspaces", icon: <FolderOpen className="w-5 h-5" />, href: "/workspaces" },
    { label: "Documents", icon: <FileText className="w-5 h-5" />, href: "/documents/dashboard" },
    { 
      label: "Agents", 
      icon: <Bot className="w-5 h-5" />,
      children: [
        { 
          label: "Create", 
          icon: <Bot className="w-4 h-4" />,
          children: [
            { label: "From Template", icon: <Bot className="w-3 h-3" />, href: "/agents/create?mode=template" },
            { label: "From Scratch", icon: <Bot className="w-3 h-3" />, href: "/agents/create?mode=scratch" },
            { label: "Clone Existing", icon: <Bot className="w-3 h-3" />, href: "/agents/create?mode=clone" },
            { label: "From Workflow", icon: <Bot className="w-3 h-3" />, href: "/agents/create?mode=workflow" },
            { label: "From Conversation", icon: <Bot className="w-3 h-3" />, href: "/agents/create?mode=conversation" },
            { label: "From Event Trigger", icon: <Bot className="w-3 h-3" />, href: "/agents/create?mode=event" },
            { label: "Import Spec", icon: <Bot className="w-3 h-3" />, href: "/agents/create?mode=import" },
          ]
        },
        { label: "Manage", icon: <Settings className="w-4 h-4" />, href: "/agents" },
        { label: "Approvals", icon: <Activity className="w-4 h-4" />, href: "/promotion-requests" },
        { label: "Dashboard", icon: <BarChart3 className="w-4 h-4" />, href: "/agent-dashboard" },
        { label: "Drift Detection", icon: <Activity className="w-4 h-4" />, href: "/drift-detection" },
        { label: "Compliance Export", icon: <FileText className="w-4 h-4" />, href: "/compliance-export" },
        { label: "Auto-Remediation", icon: <Zap className="w-4 h-4" />, href: "/auto-remediation" },
        { label: "Tools Management", icon: <Package className="w-4 h-4" />, href: "/tools-management" },
        { label: "Protocols", icon: <FileText className="w-4 h-4" />, href: "/protocols" },
        { label: "Policies", icon: <Key className="w-4 h-4" />, href: "/policies" },
      ]
    },
    {
      label: "LLM",
      icon: <Database className="w-5 h-5" />,
      children: [
        { label: "Dashboard", icon: <LayoutDashboard className="w-4 h-4" />, href: "/llm" },
        { label: "Control Plane", icon: <Settings className="w-4 h-4" />, href: "/llm/control-plane" },
        { label: "Wizard", icon: <Wand2 className="w-4 h-4" />, href: "/llm/create" },
        { label: "Settings", icon: <Settings className="w-4 h-4" />, href: "/settings" },
        { label: "Providers", icon: <Cloud className="w-4 h-4" />, href: "/providers" },
        { label: "Models", icon: <Package className="w-4 h-4" />, href: "/models" },
        { label: "Analytics", icon: <BarChart3 className="w-4 h-4" />, href: "/analytics" },
      ]
    },
    { 
      label: "Automation", 
      icon: <Zap className="w-5 h-5" />,
      children: [
        { label: "Workflows", icon: <Zap className="w-4 h-4" />, href: "/automation" },
        { label: "WCP Workflows", icon: <Activity className="w-4 h-4" />, href: "/wcp/workflows" },
        { label: "Triggers Store", icon: <Activity className="w-4 h-4" />, href: "/automation/triggers" },
        { label: "Actions Store", icon: <Package className="w-4 h-4" />, href: "/automation/actions" },
        { label: "Secrets", icon: <Key className="w-4 h-4" />, href: "/automation/secrets" },
        { label: "Templates", icon: <FileText className="w-4 h-4" />, href: "/automation/templates" },
        { label: "Settings", icon: <Settings className="w-4 h-4" />, href: "/automation/settings" },
      ]
    },
    { 
      label: "Infrastructure", 
      icon: <Activity className="w-5 h-5" />,
      children: [
        { 
          label: "Hardware", 
          icon: <Package className="w-4 h-4" />,
          children: [
            { label: "Mobiles", icon: <Activity className="w-3 h-3" />, href: "/infrastructure/hardware/mobiles" },
            { label: "Personal Computers", icon: <Activity className="w-3 h-3" />, href: "/infrastructure/hardware/pcs" },
            { label: "Servers", icon: <Activity className="w-3 h-3" />, href: "/infrastructure/hardware/servers" },
            { label: "Censors", icon: <Activity className="w-3 h-3" />, href: "/infrastructure/hardware/censors" },
            { label: "Machines", icon: <Activity className="w-3 h-3" />, href: "/infrastructure/hardware/machines" },
            { label: "Robots", icon: <Activity className="w-3 h-3" />, href: "/infrastructure/hardware/robots" },
          ]
        },
        { 
          label: "Software", 
          icon: <Package className="w-4 h-4" />,
          children: [
            { label: "Item 1", icon: <Activity className="w-3 h-3" />, href: "/infrastructure/software/item1" },
            { label: "Item 2", icon: <Activity className="w-3 h-3" />, href: "/infrastructure/software/item2" },
            { label: "Item 3", icon: <Activity className="w-3 h-3" />, href: "/infrastructure/software/item3" },
            { label: "Item 4", icon: <Activity className="w-3 h-3" />, href: "/infrastructure/software/item4" },
            { label: "Item 5", icon: <Activity className="w-3 h-3" />, href: "/infrastructure/software/item5" },
            { label: "Item 6", icon: <Activity className="w-3 h-3" />, href: "/infrastructure/software/item6" },
            { label: "Item 7", icon: <Activity className="w-3 h-3" />, href: "/infrastructure/software/item7" },
          ]
        },
      ]
    },
    { label: "Resources", icon: <Activity className="w-5 h-5" />, href: "/resources" },
    { label: "Wiki", icon: <BookOpen className="w-5 h-5" />, href: "/wiki" },
  ];

  const isActive = (href: string) => {
    if (href === "/") {
      return location === "/";
    }
    return location.startsWith(href);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 z-40 h-screen transition-transform ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } w-64 border-r border-border bg-card`}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center justify-between border-b border-border px-6">
            <Link href="/">
              <a className="flex items-center space-x-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
                  M
                </div>
                <span className="text-lg font-semibold">MyNewAppV1</span>
              </a>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
            {navItems.map((item) => (
              item.children ? (
                <div key={item.label}>
                  <button
                    onClick={() => {
                      if (item.label === "LLM") {
                        setLlmMenuOpen(!llmMenuOpen);
                      } else if (item.label === "Automation") {
                        setAutomationMenuOpen(!automationMenuOpen);
                      } else if (item.label === "Infrastructure") {
                        setInfrastructureMenuOpen(!infrastructureMenuOpen);
                      } else if (item.label === "Agents") {
                        setAgentsMenuOpen(!agentsMenuOpen);
                      }
                    }}
                    className="flex w-full items-center justify-between space-x-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  >
                    <div className="flex items-center space-x-3">
                      {item.icon}
                      <span>{item.label}</span>
                    </div>
                    {(item.label === "LLM" && llmMenuOpen) || (item.label === "Automation" && automationMenuOpen) || (item.label === "Infrastructure" && infrastructureMenuOpen) || (item.label === "Agents" && agentsMenuOpen) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                  {/* LLM and Automation menus (2-level) */}
                  {((item.label === "LLM" && llmMenuOpen) || (item.label === "Automation" && automationMenuOpen)) && (
                    <div className="ml-4 mt-1 space-y-1">
                      {item.children.map((child) => (
                        <Link key={child.href} href={child.href!}>
                          <a
                            onClick={() => setSidebarOpen(false)}
                            className={`flex items-center space-x-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                              isActive(child.href!)
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                            }`}
                          >
                            {child.icon}
                            <span>{child.label}</span>
                          </a>
                        </Link>
                      ))}
                    </div>
                  )}
                  {/* Agents menu (3-level with Create submenu) */}
                  {item.label === "Agents" && agentsMenuOpen && (
                    <div className="ml-4 mt-1 space-y-1">
                      {item.children.map((child) => (
                        child.children ? (
                          <div key={child.label}>
                            <button
                              onClick={() => setCreateMenuOpen(!createMenuOpen)}
                              className="flex w-full items-center justify-between space-x-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                            >
                              <div className="flex items-center space-x-2">
                                {child.icon}
                                <span>{child.label}</span>
                              </div>
                              {createMenuOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            </button>
                            {createMenuOpen && (
                              <div className="ml-4 mt-1 space-y-1">
                                {child.children.map((grandchild) => (
                                  <Link key={grandchild.href} href={grandchild.href!}>
                                    <a
                                      onClick={() => setSidebarOpen(false)}
                                      className={`flex items-center space-x-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                                        isActive(grandchild.href!)
                                          ? "bg-primary text-primary-foreground"
                                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                                      }`}
                                    >
                                      {grandchild.icon}
                                      <span>{grandchild.label}</span>
                                    </a>
                                  </Link>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <Link key={child.href} href={child.href!}>
                            <a
                              onClick={() => setSidebarOpen(false)}
                              className={`flex items-center space-x-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                                isActive(child.href!)
                                  ? "bg-primary text-primary-foreground"
                                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                              }`}
                            >
                              {child.icon}
                              <span>{child.label}</span>
                            </a>
                          </Link>
                        )
                      ))}
                    </div>
                  )}
                  {/* Infrastructure menu (3-level) */}
                  {item.label === "Infrastructure" && infrastructureMenuOpen && (
                    <div className="ml-4 mt-1 space-y-1">
                      {item.children.map((child) => (
                        <div key={child.label}>
                          <button
                            onClick={() => {
                              if (child.label === "Hardware") {
                                setHardwareMenuOpen(!hardwareMenuOpen);
                              } else if (child.label === "Software") {
                                setSoftwareMenuOpen(!softwareMenuOpen);
                              }
                            }}
                            className="flex w-full items-center justify-between space-x-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                          >
                            <div className="flex items-center space-x-2">
                              {child.icon}
                              <span>{child.label}</span>
                            </div>
                            {(child.label === "Hardware" && hardwareMenuOpen) || (child.label === "Software" && softwareMenuOpen) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                          </button>
                          {child.children && ((child.label === "Hardware" && hardwareMenuOpen) || (child.label === "Software" && softwareMenuOpen)) && (
                            <div className="ml-4 mt-1 space-y-1">
                              {child.children.map((grandchild) => (
                                <Link key={grandchild.href} href={grandchild.href!}>
                                  <a
                                    onClick={() => setSidebarOpen(false)}
                                    className={`flex items-center space-x-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                                      isActive(grandchild.href!)
                                        ? "bg-primary text-primary-foreground"
                                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                                    }`}
                                  >
                                    {grandchild.icon}
                                    <span>{grandchild.label}</span>
                                  </a>
                                </Link>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <Link key={item.href} href={item.href!}>
                  <a
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center space-x-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      isActive(item.href!)
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </a>
                </Link>
              )
            ))}
          </nav>

          {/* User Profile */}
          <div className="border-t border-border p-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="w-full justify-start px-2 h-auto py-2">
                  <div className="flex items-center space-x-3 w-full">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                        {user?.name?.charAt(0).toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-medium">{user?.name || "User"}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {user?.email || ""}
                      </p>
                    </div>
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem>
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className={`transition-all ${sidebarOpen ? "lg:pl-64" : ""}`}>
        {/* Top Bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border bg-card px-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex-1" />
        </header>

        {/* Page Content */}
        <main className="p-6">{children}</main>
      </div>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-background/80 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}
