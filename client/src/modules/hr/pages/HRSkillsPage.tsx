/**
 * HR Skills Page — Skills and certifications lookup
 */

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";

export default function HRSkillsPage() {
  const skillsQuery = trpc.hr.staffing.listSkills.useQuery({});
  const certsQuery = trpc.hr.staffing.listCertifications.useQuery({});

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Skills & Certifications</h1>
          <p className="text-muted-foreground">Workforce capability catalog</p>
        </div>
        <Link href="/hr"><Button variant="outline" size="sm">Back to HR</Button></Link>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardContent className="p-4">
            <h2 className="font-medium mb-3">Skills</h2>
            {(skillsQuery.data?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">No skills recorded yet</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {skillsQuery.data?.map((s: any, i: number) => (
                  <Badge key={i} variant="outline">{s.skillName}</Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <h2 className="font-medium mb-3">Certifications</h2>
            {(certsQuery.data?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">No certifications recorded yet</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {certsQuery.data?.map((c: any, i: number) => (
                  <Badge key={i} variant="secondary">{c.certificationName}</Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
