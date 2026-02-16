import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronLeft, Construction } from "lucide-react";

export default function NewProviderPage() {
  const [, navigate] = useLocation();

  return (
    <div className="container mx-auto py-8 max-w-2xl">
      <Button variant="ghost" size="sm" className="mb-6" onClick={() => navigate("/llm/provider-wizard")}>
        <ChevronLeft className="h-4 w-4 mr-1" />
        Back
      </Button>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Construction className="h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-2xl font-bold mb-2">Coming Soon</h2>
          <p className="text-muted-foreground text-center">
            Custom provider creation is under development.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
