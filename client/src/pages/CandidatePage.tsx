import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, UserCheck } from "lucide-react";

export default function CandidatePage() {
  const [, navigate] = useLocation();

  return (
    <div className="container max-w-3xl mx-auto py-10 px-4">
      <Button variant="ghost" size="sm" className="mb-6" onClick={() => navigate("/llm/catalogue/manage")}>
        <ChevronLeft className="h-4 w-4 mr-1" />Back to Manage Catalogue
      </Button>

      <Card>
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <UserCheck className="h-7 w-7 text-primary" />
          </div>
          <CardTitle className="text-2xl">Candidate</CardTitle>
        </CardHeader>
        <CardContent className="text-center">
          <p className="text-muted-foreground text-lg mb-2">Coming Soon</p>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            The Candidate pipeline will allow you to submit, review, and promote catalog entries through a structured approval workflow.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
