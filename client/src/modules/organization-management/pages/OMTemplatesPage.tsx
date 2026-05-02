/**
 * OM Templates — Browse reusable organization structure blueprints
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Building2, GitBranch, ChevronDown, ChevronRight, Users, Briefcase, DollarSign, ShieldCheck, ArrowUpRight } from "lucide-react";

const MODEL_COLORS: Record<string, string> = {
  functional: "bg-blue-500/10 text-blue-600 border-blue-500/30",
  divisional: "bg-purple-500/10 text-purple-600 border-purple-500/30",
  matrix: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  flat: "bg-green-500/10 text-green-600 border-green-500/30",
  network: "bg-cyan-500/10 text-cyan-600 border-cyan-500/30",
};

const MODEL_ICONS: Record<string, string> = {
  functional: "Departments report to C-suite",
  divisional: "Semi-autonomous product/geo divisions",
  matrix: "Dual reporting (functional + product)",
  flat: "Minimal layers, self-organizing squads",
  network: "Core hub + external partners",
};

export function OMTemplatesPage({ workspaceId }: { workspaceId: number }) {
  const { data: templates, isLoading } = trpc.organizationManagement.templates.list.useQuery();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Organization Templates</h1>
        <Badge variant="secondary">{templates?.length ?? 0} templates</Badge>
      </div>

      <p className="text-sm text-muted-foreground">
        Reusable organization structure blueprints. Each template contains a full structural snapshot
        (legal entity, org units, jobs, positions, reporting lines, cost centers) that can be applied via the OM Wizard.
      </p>

      {(!templates || templates.length === 0) ? (
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">No templates available. Templates are seeded automatically on server startup.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {templates.map((tpl: any) => {
            const isExpanded = expandedId === tpl.id;
            const snap = tpl.snapshot as any;
            return (
              <Card key={tpl.id} className="overflow-hidden">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : tpl.id)}
                  className="w-full text-left"
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                          <Building2 className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div>
                          <CardTitle className="text-base">{tpl.name}</CardTitle>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge className={`text-xs ${MODEL_COLORS[tpl.structureModel] || "bg-muted"}`}>
                              {tpl.structureModel}
                            </Badge>
                            {tpl.isSystem && <Badge variant="outline" className="text-xs">System</Badge>}
                          </div>
                        </div>
                      </div>
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 pb-3">
                    <p className="text-sm text-muted-foreground">{tpl.description}</p>
                    {MODEL_ICONS[tpl.structureModel] && (
                      <p className="text-xs text-muted-foreground/70 mt-1 italic">{MODEL_ICONS[tpl.structureModel]}</p>
                    )}
                  </CardContent>
                </button>

                {isExpanded && snap && (
                  <div className="border-t bg-muted/30 px-6 py-4 space-y-4">
                    {/* Stats row */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      <div className="flex items-center gap-2 text-sm">
                        <Building2 className="w-4 h-4 text-blue-500" />
                        <span className="font-medium">{snap.orgUnits?.length ?? 0}</span>
                        <span className="text-muted-foreground">Org Units</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Briefcase className="w-4 h-4 text-green-500" />
                        <span className="font-medium">{snap.jobs?.length ?? 0}</span>
                        <span className="text-muted-foreground">Jobs</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Users className="w-4 h-4 text-orange-500" />
                        <span className="font-medium">{snap.positions?.length ?? 0}</span>
                        <span className="text-muted-foreground">Positions</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <GitBranch className="w-4 h-4 text-purple-500" />
                        <span className="font-medium">{snap.reportingLines?.length ?? 0}</span>
                        <span className="text-muted-foreground">Reporting Lines</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <DollarSign className="w-4 h-4 text-yellow-500" />
                        <span className="font-medium">{snap.costCenters?.length ?? 0}</span>
                        <span className="text-muted-foreground">Cost Centers</span>
                      </div>
                    </div>

                    {/* Legal entity */}
                    {snap.legalEntity && (
                      <div className="text-sm">
                        <span className="font-medium">Legal Entity:</span>{" "}
                        <span>{snap.legalEntity.name}</span>{" "}
                        <Badge variant="outline" className="text-xs ml-1">{snap.legalEntity.type}</Badge>
                      </div>
                    )}

                    {/* Org Units list */}
                    {snap.orgUnits?.length > 0 && (
                      <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1.5">Org Units</p>
                        <div className="flex flex-wrap gap-1.5">
                          {snap.orgUnits.map((u: any, i: number) => (
                            <Badge key={i} variant="outline" className="text-xs">{u.name} ({u.type})</Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Positions list */}
                    {snap.positions?.length > 0 && (
                      <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1.5">Positions</p>
                        <div className="flex flex-wrap gap-1.5">
                          {snap.positions.map((p: any, i: number) => (
                            <Badge key={i} variant="secondary" className="text-xs">{p.title}</Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Governance */}
                    {(snap.governanceNotes || snap.decisionRights || snap.escalationPath) && (
                      <div className="space-y-2 pt-1">
                        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3" /> Governance
                        </p>
                        {snap.governanceNotes && (
                          <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Notes:</span> {snap.governanceNotes}</p>
                        )}
                        {snap.decisionRights && (
                          <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Decision Rights:</span> {snap.decisionRights}</p>
                        )}
                        {snap.escalationPath && (
                          <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Escalation:</span> {snap.escalationPath}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default OMTemplatesPage;
