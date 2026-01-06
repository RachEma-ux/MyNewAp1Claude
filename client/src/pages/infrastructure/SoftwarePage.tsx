import { useParams } from "wouter";
import { Code2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SoftwarePage() {
  const params = useParams<{ item?: string }>();
  const item = params.item || "item1";
  
  // Map URL params to display names
  const itemNames: Record<string, string> = {
    item1: "Item 1",
    item2: "Item 2",
    item3: "Item 3",
    item4: "Item 4",
    item5: "Item 5",
    item6: "Item 6",
    item7: "Item 7",
  };

  const displayName = itemNames[item] || item;

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Software: {displayName}</h1>
        <p className="text-muted-foreground">
          Software infrastructure management
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-3">
              <Code2 className="w-6 h-6 text-primary" />
              <CardTitle>Overview</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              This is a placeholder page for {displayName}. Software management features will be added here.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Configure settings and parameters for {displayName}.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Monitoring</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Monitor performance and status of {displayName}.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
