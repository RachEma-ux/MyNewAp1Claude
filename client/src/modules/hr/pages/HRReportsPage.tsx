/**
 * HR Reports Page — Placeholder for Phase 2
 */

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart3 } from "lucide-react";
import { Link } from "wouter";

export default function HRReportsPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">HR Reports</h1>
        <Link href="/hr"><Button variant="outline" size="sm">Back to HR</Button></Link>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <BarChart3 className="w-12 h-12 text-muted-foreground mb-4" />
          <h2 className="text-lg font-medium">Reports Coming Soon</h2>
          <p className="text-muted-foreground mt-1">HR analytics and reporting will be available in Phase 2.</p>
        </CardContent>
      </Card>
    </div>
  );
}
