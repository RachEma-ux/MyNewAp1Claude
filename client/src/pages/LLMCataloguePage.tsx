import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronLeft, BookOpen } from "lucide-react";

export default function LLMCataloguePage() {
  const [, navigate] = useLocation();

  return (
    <div className="container mx-auto py-8 max-w-4xl px-4">
      <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate("/llm")}>
        <ChevronLeft className="h-4 w-4 mr-1" />Back to LLM
      </Button>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-24">
          <BookOpen className="h-16 w-16 text-muted-foreground mb-6" />
          <h1 className="text-2xl font-bold mb-2">Catalogue</h1>
          <p className="text-muted-foreground text-center max-w-md">
            Coming soon. The unified model and provider catalogue will be available here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
