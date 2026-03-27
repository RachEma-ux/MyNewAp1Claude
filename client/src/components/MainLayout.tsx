import { ReactNode, createContext, useContext, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";

// Context for pages to inject actions into the top header bar
const HeaderActionsContext = createContext<{
  actions: ReactNode;
  setActions: (node: ReactNode) => void;
}>({ actions: null, setActions: () => {} });

export function useHeaderActions(node: ReactNode) {
  const { setActions } = useContext(HeaderActionsContext);
  useEffect(() => {
    setActions(node);
    return () => setActions(null);
  }, [node]);
}
import { useAuth } from "@/_core/hooks/useAuth";
import { useHrRole } from "@/hooks/useHrRole";
import { HR_NAV_CONFIG } from "@/config/hrNavConfig";
import { HRSideNav } from "@/components/HRSideNav";
import { PM_NAV_CONFIG } from "@/config/pmNavConfig";
import { AUTOMATION_NAV_CONFIG } from "@/config/automationNavConfig";
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
  Users,
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
  List,
  Plug,
  Building2,
  ShieldCheck,
  AlertTriangle,
  GitPullRequest,
  Clock,
  Shield,
  Lock,
  FileSearch,
  Terminal,
  FolderKanban,
  FileStack,
  Sparkles,
  Inbox,
  Radio,
  Video,
  Briefcase,
  UserPlus,
  UserMinus,
  Award,
  ClipboardList,
  Lightbulb,
} from "lucide-react";

interface MainLayoutProps {
  children: ReactNode;
}

interface NavItem {
  label: string;
  icon: ReactNode;
  href?: string;
  children?: NavItem[];
  requiredAction?: string;
}

export default function MainLayout({ children }: MainLayoutProps) {
  const [location] = useLocation();
  const { user } = useAuth();
  // Start closed on mobile, open on desktop
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [headerActions, setHeaderActions] = useState<ReactNode>(null);
  const [automationMenuOpen, setAutomationMenuOpen] = useState(false);
  const [digitalHQMenuOpen, setDigitalHQMenuOpen] = useState(false);
  const [governanceCenterMenuOpen, setGovernanceCenterMenuOpen] = useState(false);
  const [infrastructureMenuOpen, setInfrastructureMenuOpen] = useState(false);
  const [hardwareMenuOpen, setHardwareMenuOpen] = useState(false);
  const [softwareMenuOpen, setSoftwareMenuOpen] = useState(false);
  const [aiTypesMenuOpen, setAiTypesMenuOpen] = useState(false);
  const [pmCentralMenuOpen, setPmCentralMenuOpen] = useState(false);
  const [wsSandboxMenuOpen, setWsSandboxMenuOpen] = useState(false);
  const [communicationMenuOpen, setCommunicationMenuOpen] = useState(false);
  const [hrMenuOpen, setHrMenuOpen] = useState(false);
  const [omMenuOpen, setOmMenuOpen] = useState(false);
  const [cvMenuOpen, setCvMenuOpen] = useState(false);
  const [psMenuOpen, setPsMenuOpen] = useState(false);
  const [aiTypesSubMenus, setAiTypesSubMenus] = useState<Record<string, boolean>>({});
  const hrRole = useHrRole();
  const logoutMutation = trpc.auth.logout.useMutation();

  const handleLogout = async () => {
    await logoutMutation.mutateAsync();
    window.location.href = "/";
  };

  const navItems: NavItem[] = [
    { label: "Dashboard", icon: <LayoutDashboard className="w-5 h-5" />, href: "/" },
    {
      label: "Org Management",
      icon: <Building2 className="w-5 h-5" />,
      children: [
        { label: "Portfolio", icon: <LayoutDashboard className="w-4 h-4" />, href: "/om/portfolio" },
        { label: "Control Panel", icon: <Settings className="w-4 h-4" />, href: "/om/control-panel" },
        { label: "OM Wizard", icon: <Wand2 className="w-4 h-4" />, href: "/om/wizard" },
        { label: "OM Records", icon: <List className="w-4 h-4" />, href: "/om/list" },
        { label: "Settings", icon: <Settings className="w-4 h-4" />, href: "/om/settings" },
      ],
    },
    {
      label: "Culture Values",
      icon: <Award className="w-5 h-5" />,
      children: [
        { label: "Portfolio", icon: <LayoutDashboard className="w-4 h-4" />, href: "/cv/portfolio" },
        { label: "Values Wizard", icon: <Wand2 className="w-4 h-4" />, href: "/cv/wizard" },
        { label: "Settings", icon: <Settings className="w-4 h-4" />, href: "/cv/settings" },
      ],
    },
    {
      label: "Communication",
      icon: <Radio className="w-5 h-5" />,
      children: [
        { label: "Chat", icon: <MessageSquare className="w-4 h-4" />, href: "/chat" },
        { label: "Conversations", icon: <MessagesSquare className="w-4 h-4" />, href: "/conversations" },
        { label: "Video Meeting", icon: <Video className="w-4 h-4" />, href: "/video-meeting" },
      ]
    },
    {
      label: "Workspaces",
      icon: <Sparkles className="w-5 h-5" />,
      children: [
        { label: "Dashboard", icon: <LayoutDashboard className="w-4 h-4" />, href: "/ws/dashboard" },
        { label: "Control Panel", icon: <Settings className="w-4 h-4" />, href: "/ws/control-panel" },
        { label: "Wizard", icon: <Wand2 className="w-4 h-4" />, href: "/ws/wizard" },
        { label: "WS List", icon: <List className="w-4 h-4" />, href: "/ws/list" },
        { label: "WS Catalog", icon: <BookOpen className="w-4 h-4" />, href: "/ws/catalog" },
      ]
    },
    { label: "Documents", icon: <FileText className="w-5 h-5" />, href: "/documents/dashboard" },
    {
      label: "AI Types",
      icon: <Database className="w-5 h-5" />,
      children: [
        { label: "AI Catalogue", icon: <List className="w-4 h-4" />, href: "/llm/catalogue" },
        {
          label: "Providers",
          icon: <Cloud className="w-4 h-4" />,
          children: [
            { label: "Dashboard", icon: <BarChart3 className="w-3 h-3" />, href: "/providers/dashboard" },
            { label: "Control Panel", icon: <Settings className="w-3 h-3" />, href: "/providers/control-panel" },
            { label: "Wizard", icon: <Wand2 className="w-3 h-3" />, href: "/providers/wizard" },
            { label: "Providers List", icon: <List className="w-3 h-3" />, href: "/list/providers" },
          ]
        },
        {
          label: "LLMs",
          icon: <Database className="w-4 h-4" />,
          children: [
            { label: "Dashboard", icon: <LayoutDashboard className="w-3 h-3" />, href: "/llm" },
            { label: "Control Panel", icon: <Settings className="w-3 h-3" />, href: "/llm/control-panel" },
            { label: "LLMs Register", icon: <FileStack className="w-3 h-3" />, href: "/llm/register" },
            { label: "LLM Wizard", icon: <Wand2 className="w-3 h-3" />, href: "/llm/wizard" },
            { label: "LLMs List", icon: <List className="w-3 h-3" />, href: "/list/llms" },
          ]
        },
        {
          label: "Models",
          icon: <Package className="w-4 h-4" />,
          children: [
            { label: "Browse", icon: <Package className="w-3 h-3" />, href: "/models" },
            { label: "Dashboard", icon: <BarChart3 className="w-3 h-3" />, href: "/models/dashboard" },
            { label: "Control Panel", icon: <Settings className="w-3 h-3" />, href: "/models/control-panel" },
            { label: "Wizard", icon: <Wand2 className="w-3 h-3" />, href: "/models/wizard" },
            { label: "Models List", icon: <List className="w-3 h-3" />, href: "/list/models" },
          ]
        },
        {
          label: "Agents",
          icon: <Bot className="w-4 h-4" />,
          children: [
            { label: "Dashboard", icon: <BarChart3 className="w-3 h-3" />, href: "/agents/dashboard" },
            { label: "Control Panel", icon: <Settings className="w-3 h-3" />, href: "/agents/control-panel" },
            { label: "Agent Wizard", icon: <Wand2 className="w-3 h-3" />, href: "/agents/wizard" },
            { label: "Agents List", icon: <List className="w-3 h-3" />, href: "/list/agents" },
          ]
        },
        {
          label: "Bots",
          icon: <MessageSquare className="w-4 h-4" />,
          children: [
            { label: "Dashboard", icon: <BarChart3 className="w-3 h-3" />, href: "/bots/dashboard" },
            { label: "Control Panel", icon: <Settings className="w-3 h-3" />, href: "/bots/control-panel" },
            { label: "Wizard", icon: <Wand2 className="w-3 h-3" />, href: "/bots/wizard" },
            { label: "Bots List", icon: <List className="w-3 h-3" />, href: "/list/bots" },
            { label: "Analytics", icon: <BarChart3 className="w-3 h-3" />, href: "/analytics" },
          ]
        },
      ]
    },
    {
      label: "Run Console",
      icon: <Terminal className="w-5 h-5" />,
      href: "/run-console",
    },
    {
      label: "Digital HQ",
      icon: <Building2 className="w-5 h-5" />,
      children: [
        { label: "Org Authority", icon: <Building2 className="w-4 h-4" />, href: "/hq/org-authority" },
        { label: "Roles", icon: <Users className="w-4 h-4" />, href: "/hq/roles" },
        { label: "Workspaces", icon: <FolderOpen className="w-4 h-4" />, href: "/hq/workspaces" },
        { label: "Agents", icon: <Bot className="w-4 h-4" />, href: "/hq/agents" },
        { label: "Discover", icon: <Database className="w-4 h-4" />, href: "/hq/discover" },
        { label: "Notifications", icon: <Activity className="w-4 h-4" />, href: "/hq/notifications" },
        { label: "Risk Baselines", icon: <AlertTriangle className="w-4 h-4" />, href: "/hq/risk-baselines" },
        { label: "Collaboration", icon: <BarChart3 className="w-4 h-4" />, href: "/hq/collaboration" },
      ]
    },
    {
      label: "Governance Center",
      icon: <ShieldCheck className="w-5 h-5" />,
      children: [
        { label: "Overview", icon: <LayoutDashboard className="w-4 h-4" />, href: "/governance/overview" },
        { label: "Scorecards", icon: <ShieldCheck className="w-4 h-4" />, href: "/governance/scorecards" },
        { label: "Controls", icon: <FileText className="w-4 h-4" />, href: "/governance/controls" },
        { label: "Packs", icon: <Package className="w-4 h-4" />, href: "/governance/packs" },
        { label: "Freezes", icon: <Lock className="w-4 h-4" />, href: "/governance/freezes" },
        { label: "Drift", icon: <Activity className="w-4 h-4" />, href: "/governance/drift" },
        { label: "Coverage", icon: <BarChart3 className="w-4 h-4" />, href: "/governance/coverage" },
        { label: "Audit", icon: <FileSearch className="w-4 h-4" />, href: "/governance/audit" },
      ]
    },
    {
      label: "Collaboration",
      icon: <MessagesSquare className="w-5 h-5" />,
      href: "/collaboration",
    },
    {
      label: "PM Central",
      icon: <FolderKanban className="w-5 h-5" />,
      children: PM_NAV_CONFIG.sections.map((section) => ({
        label: section.label,
        icon: <FolderKanban className="w-4 h-4" />,
        href: section.currentRoute ?? section.href,
      })),
    },
    {
      label: "Projects System",
      icon: <ClipboardList className="w-5 h-5" />,
      children: [
        { label: "PS Catalog", icon: <ClipboardList className="w-4 h-4" />, href: "/ps/catalog" },
        { label: "PS Ideation", icon: <Lightbulb className="w-4 h-4" />, href: "/ps/ideation" },
        { label: "PS Control Panel", icon: <Settings className="w-4 h-4" />, href: "/ps/control-panel" },
        { label: "PS Wizard", icon: <Wand2 className="w-4 h-4" />, href: "/ps/wizard" },
        { label: "PS List", icon: <List className="w-4 h-4" />, href: "/ps/list" },
      ],
    },
    {
      label: "Human Resources",
      icon: <Users className="w-5 h-5" />,
      children: HR_NAV_CONFIG.sections.map((section) => ({
        label: section.label,
        icon: <Users className="w-4 h-4" />,
        href: section.href,
        requiredAction: section.requiredAction,
      })),
    },
    {
      label: "Automation",
      icon: <Zap className="w-5 h-5" />,
      children: [
        ...AUTOMATION_NAV_CONFIG.sections.map((section) => ({
          label: section.label,
          icon: <Zap className="w-4 h-4" />,
          href: section.currentRoute ?? section.href,
        })),
        { label: "WCP Workflows", icon: <Activity className="w-4 h-4" />, href: "/wcp/workflows" },
      ],
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
    <HeaderActionsContext.Provider value={{ actions: headerActions, setActions: setHeaderActions }}>
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
                      if (item.label === "Automation") {
                        setAutomationMenuOpen(!automationMenuOpen);
                      } else if (item.label === "Infrastructure") {
                        setInfrastructureMenuOpen(!infrastructureMenuOpen);
                      } else if (item.label === "AI Types") {
                        setAiTypesMenuOpen(!aiTypesMenuOpen);
                      } else if (item.label === "Digital HQ") {
                        setDigitalHQMenuOpen(!digitalHQMenuOpen);
                      } else if (item.label === "Governance Center") {
                        setGovernanceCenterMenuOpen(!governanceCenterMenuOpen);
                      } else if (item.label === "PM Central") {
                        setPmCentralMenuOpen(!pmCentralMenuOpen);
                      } else if (item.label === "Workspaces") {
                        setWsSandboxMenuOpen(!wsSandboxMenuOpen);
                      } else if (item.label === "Communication") {
                        setCommunicationMenuOpen(!communicationMenuOpen);
                      } else if (item.label === "Human Resources") {
                        setHrMenuOpen(!hrMenuOpen);
                      } else if (item.label === "Org Management") {
                        setOmMenuOpen(!omMenuOpen);
                      } else if (item.label === "Culture Values") {
                        setCvMenuOpen(!cvMenuOpen);
                      } else if (item.label === "Projects System") {
                        setPsMenuOpen(!psMenuOpen);
                      }
                    }}
                    className="flex w-full items-center justify-between space-x-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  >
                    <div className="flex items-center space-x-3">
                      {item.icon}
                      <span>{item.label}</span>
                    </div>
                    {(item.label === "Automation" && automationMenuOpen) || (item.label === "Infrastructure" && infrastructureMenuOpen) || (item.label === "AI Types" && aiTypesMenuOpen) || (item.label === "Digital HQ" && digitalHQMenuOpen) || (item.label === "Governance Center" && governanceCenterMenuOpen) || (item.label === "PM Central" && pmCentralMenuOpen) || (item.label === "Projects System" && psMenuOpen) || (item.label === "Workspaces" && wsSandboxMenuOpen) || (item.label === "Communication" && communicationMenuOpen) || (item.label === "Human Resources" && hrMenuOpen) || (item.label === "Org Management" && omMenuOpen) || (item.label === "Culture Values" && cvMenuOpen) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                  {/* Automation / Digital HQ menus (2-level) */}
                  {((item.label === "Automation" && automationMenuOpen) || (item.label === "Digital HQ" && digitalHQMenuOpen) || (item.label === "Governance Center" && governanceCenterMenuOpen) || (item.label === "PM Central" && pmCentralMenuOpen) || (item.label === "Projects System" && psMenuOpen) || (item.label === "Workspaces" && wsSandboxMenuOpen) || (item.label === "Communication" && communicationMenuOpen) || (item.label === "Org Management" && omMenuOpen) || (item.label === "Culture Values" && cvMenuOpen)) && (
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
                  {/* Human Resources menu (Carbon-style 3-level accordion nav) */}
                  {item.label === "Human Resources" && hrMenuOpen && (
                    <HRSideNav
                      onNavigate={() => setSidebarOpen(false)}
                      className="ml-2 mt-1"
                    />
                  )}
                  {/* AI Types menu (3-level with dynamic sub-menus) */}
                  {item.label === "AI Types" && aiTypesMenuOpen && (
                    <div className="ml-4 mt-1 space-y-1">
                      {item.children.map((child) => (
                        child.children ? (
                          <div key={child.label}>
                            <button
                              onClick={() => setAiTypesSubMenus(prev => ({ ...prev, [child.label]: !prev[child.label] }))}
                              className="flex w-full items-center justify-between space-x-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                            >
                              <div className="flex items-center space-x-2">
                                {child.icon}
                                <span>{child.label}</span>
                              </div>
                              {aiTypesSubMenus[child.label] ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            </button>
                            {aiTypesSubMenus[child.label] && child.children && (
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
          {headerActions && (
            <div className="flex items-center gap-2">
              {headerActions}
            </div>
          )}
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
    </HeaderActionsContext.Provider>
  );
}
