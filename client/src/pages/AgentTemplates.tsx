import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  BarChart3, Code, FileText, Search, Database, Mail, 
  Sparkles, Rocket, CheckCircle2 
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  icon: any;
  category: string;
  tools: string[];
  systemPrompt: string;
  useCases: string[];
  deployCount: number;
}

const templates: AgentTemplate[] = [
  {
    id: "data-analyst",
    name: "Data Analyst",
    description: "Analyzes datasets, generates insights, and creates visualizations",
    icon: BarChart3,
    category: "Analytics",
    tools: ["database_query", "data_visualization", "statistical_analysis", "report_generator"],
    systemPrompt: "You are an expert data analyst. Analyze datasets, identify patterns, generate insights, and create clear visualizations. Always explain your methodology and provide actionable recommendations.",
    useCases: [
      "Automated daily/weekly data reports",
      "Anomaly detection in metrics",
      "Trend analysis and forecasting",
      "Customer behavior analysis",
    ],
    deployCount: 1247,
  },
  {
    id: "code-reviewer",
    name: "Code Reviewer",
    description: "Reviews code for bugs, security issues, and best practices",
    icon: Code,
    category: "Development",
    tools: ["code_analyzer", "security_scanner", "style_checker", "documentation_generator"],
    systemPrompt: "You are a senior software engineer conducting code reviews. Check for bugs, security vulnerabilities, performance issues, and adherence to best practices. Provide constructive feedback with specific examples and suggestions.",
    useCases: [
      "Automated PR reviews",
      "Security vulnerability scanning",
      "Code quality enforcement",
      "Documentation completeness checks",
    ],
    deployCount: 892,
  },
  {
    id: "content-writer",
    name: "Content Writer",
    description: "Creates high-quality content for blogs, social media, and marketing",
    icon: FileText,
    category: "Content",
    tools: ["web_search", "seo_analyzer", "grammar_checker", "plagiarism_detector"],
    systemPrompt: "You are a professional content writer. Create engaging, well-researched content optimized for SEO. Maintain consistent tone and style while ensuring accuracy and originality.",
    useCases: [
      "Blog post generation",
      "Social media content creation",
      "Email campaign copywriting",
      "Product descriptions",
    ],
    deployCount: 1543,
  },
  {
    id: "research-assistant",
    name: "Research Assistant",
    description: "Conducts research, summarizes findings, and cites sources",
    icon: Search,
    category: "Research",
    tools: ["web_search", "academic_search", "document_reader", "citation_generator"],
    systemPrompt: "You are a research assistant. Conduct thorough research, synthesize information from multiple sources, and provide well-cited summaries. Always verify facts and cite sources properly.",
    useCases: [
      "Market research reports",
      "Competitive analysis",
      "Literature reviews",
      "Fact-checking and verification",
    ],
    deployCount: 678,
  },
  {
    id: "database-admin",
    name: "Database Administrator",
    description: "Manages databases, optimizes queries, and monitors performance",
    icon: Database,
    category: "Operations",
    tools: ["database_query", "query_optimizer", "backup_manager", "performance_monitor"],
    systemPrompt: "You are a database administrator. Optimize database performance, ensure data integrity, manage backups, and troubleshoot issues. Follow security best practices and maintain documentation.",
    useCases: [
      "Query optimization",
      "Automated backups",
      "Performance monitoring",
      "Schema migrations",
    ],
    deployCount: 421,
  },
  {
    id: "email-assistant",
    name: "Email Assistant",
    description: "Drafts professional emails, manages responses, and schedules follow-ups",
    icon: Mail,
    category: "Communication",
    tools: ["email_sender", "calendar_manager", "contact_lookup", "template_generator"],
    systemPrompt: "You are a professional email assistant. Draft clear, concise, and professional emails. Maintain appropriate tone for different contexts and ensure proper formatting.",
    useCases: [
      "Customer support responses",
      "Meeting scheduling",
      "Follow-up reminders",
      "Newsletter generation",
    ],
    deployCount: 956,
  },
];

export default function AgentTemplates() {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [, setLocation] = useLocation();
  
  const categories = ["all", ...Array.from(new Set(templates.map(t => t.category)))];
  
  const filteredTemplates = selectedCategory === "all"
    ? templates
    : templates.filter(t => t.category === selectedCategory);

  const deployMutation = trpc.agents.deployTemplate.useMutation({
    onSuccess: (data) => {
      toast.success(`Agent deployed successfully!`);
      // Redirect to Agent Dashboard
      setLocation(`/agents/dashboard`);
    },
    onError: (error) => {
      toast.error(`Failed to deploy agent: ${error.message}`);
    },
  });

  const handleDeploy = (template: AgentTemplate) => {
    toast.info(`Deploying ${template.name}...`);
    deployMutation.mutate({
      templateId: template.id,
      name: template.name,
      workspaceId: 1, // Default workspace
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Agent Templates</h1>
        <p className="text-muted-foreground mt-1">
          Deploy pre-built AI agents with one click
        </p>
      </div>

      {/* Category Filter */}
      <div className="flex gap-2">
        {categories.map((category) => (
          <Button
            key={category}
            variant={selectedCategory === category ? "default" : "outline"}
            onClick={() => setSelectedCategory(category)}
          >
            {category.charAt(0).toUpperCase() + category.slice(1)}
          </Button>
        ))}
      </div>

      {/* Templates Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {filteredTemplates.map((template) => {
          const Icon = template.icon;
          return (
            <Card key={template.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="p-3 rounded-lg bg-primary/10">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <Badge variant="secondary">{template.category}</Badge>
                </div>
                <CardTitle className="mt-4">{template.name}</CardTitle>
                <CardDescription>{template.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                {/* Tools */}
                <div className="mb-4">
                  <h4 className="text-sm font-semibold mb-2">Included Tools</h4>
                  <div className="flex flex-wrap gap-1">
                    {template.tools.map((tool) => (
                      <Badge key={tool} variant="outline" className="text-xs">
                        {tool}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Use Cases */}
                <div className="mb-4">
                  <h4 className="text-sm font-semibold mb-2">Use Cases</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    {template.useCases.slice(0, 3).map((useCase, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <CheckCircle2 className="h-3 w-3 mt-0.5 flex-shrink-0 text-green-500" />
                        <span>{useCase}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Deploy Stats */}
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                  <Sparkles className="h-4 w-4" />
                  <span>{template.deployCount.toLocaleString()} deployments</span>
                </div>

                {/* Deploy Button */}
                <Button 
                  className="w-full mt-auto" 
                  onClick={() => handleDeploy(template)}
                >
                  <Rocket className="h-4 w-4 mr-2" />
                  Deploy Agent
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
