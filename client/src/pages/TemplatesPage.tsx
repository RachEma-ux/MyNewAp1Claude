import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, RefreshCw, Bell, Database, Loader2, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const categoryIcons: Record<string, any> = {
  productivity: FileText,
  data: Database,
  communication: Bell,
  monitoring: TrendingUp,
};

export default function TemplatesPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  
  const { data: templates = [], isLoading } = trpc.templates.list.useQuery({
    category: selectedCategory as any,
  });
  
  const useTemplateMutation = trpc.templates.useTemplate.useMutation({
    onSuccess: (data) => {
      toast({
        title: "Workflow Created",
        description: `"${data.name}" has been created from template`,
      });
      navigate(`/automation/builder/${data.workflowId}`);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleUseTemplate = (templateId: number, templateName: string) => {
    useTemplateMutation.mutate({
      templateId,
      workflowName: `${templateName} (Copy)`,
    });
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Workflow Templates</h1>
        <p className="text-muted-foreground">
          Start with pre-built workflows for common automation patterns
        </p>
      </div>

      <Tabs defaultValue="all" onValueChange={(v) => setSelectedCategory(v === "all" ? undefined : v)}>
        <TabsList className="mb-6">
          <TabsTrigger value="all">All Templates</TabsTrigger>
          <TabsTrigger value="productivity">Productivity</TabsTrigger>
          <TabsTrigger value="data">Data</TabsTrigger>
          <TabsTrigger value="communication">Communication</TabsTrigger>
          <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
        </TabsList>

        <TabsContent value={selectedCategory || "all"}>
          {templates.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <FileText className="h-16 w-16 text-muted-foreground mb-4" />
                <h3 className="text-xl font-semibold mb-2">No Templates Found</h3>
                <p className="text-muted-foreground text-center">
                  There are no templates available in this category yet.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {templates.map((template) => {
                const Icon = categoryIcons[template.category] || FileText;
                return (
                  <Card key={template.id} className="flex flex-col">
                    <CardHeader>
                      <div className="flex items-start justify-between mb-2">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <Icon className="h-6 w-6 text-primary" />
                        </div>
                        <Badge variant="secondary">{template.category}</Badge>
                      </div>
                      <CardTitle className="text-xl">{template.name}</CardTitle>
                      <CardDescription>{template.description}</CardDescription>
                    </CardHeader>
                    
                    <CardContent className="flex-1">
                      <div className="flex flex-wrap gap-2">
                        {(template.tags as string[] || []).map((tag, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                      
                      {template.usageCount > 0 && (
                        <p className="text-sm text-muted-foreground mt-4">
                          Used {template.usageCount} {template.usageCount === 1 ? "time" : "times"}
                        </p>
                      )}
                    </CardContent>
                    
                    <CardFooter>
                      <Button
                        className="w-full"
                        onClick={() => handleUseTemplate(template.id, template.name)}
                        disabled={useTemplateMutation.isPending}
                      >
                        {useTemplateMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Creating...
                          </>
                        ) : (
                          "Use Template"
                        )}
                      </Button>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
