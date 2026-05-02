/**
 * HR Certifications Page — Certification catalog and employee certifications with expiry tracking
 */

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { ShieldCheck, AlertTriangle } from "lucide-react";
import { Link } from "wouter";

const certStatusVariant = (s: string) => {
  switch (s) {
    case "active": return "default" as const;
    case "expired": return "destructive" as const;
    case "pending_renewal": return "outline" as const;
    case "revoked": return "destructive" as const;
    default: return "outline" as const;
  }
};

export default function HRCertificationsPage() {
  const [tab, setTab] = useState("catalog");
  const [empCertStatus, setEmpCertStatus] = useState("all");

  const catalogQuery = trpc.hr.learning.listCertifications.useQuery({});
  const empCertsQuery = trpc.hr.learning.listEmployeeCertifications.useQuery({
    status: empCertStatus !== "all" ? empCertStatus : undefined,
  });
  const expiringQuery = trpc.hr.learning.listExpiringCertifications.useQuery({ withinDays: 90 });

  const catalog = catalogQuery.data ?? [];
  const empCerts = empCertsQuery.data ?? [];
  const expiring = expiringQuery.data ?? [];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Certifications</h1>
          <p className="text-muted-foreground">Certification catalog and employee tracking</p>
        </div>
        <Link href="/hr">
          <Button variant="outline" size="sm">Back to HR</Button>
        </Link>
      </div>

      {expiring.length > 0 && (
        <Card className="border-orange-500/50 bg-orange-500/5">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            <div>
              <div className="font-medium">{expiring.length} certification(s) expiring within 90 days</div>
              <div className="text-sm text-muted-foreground">Review and schedule renewals</div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="catalog">Certification Catalog</TabsTrigger>
          <TabsTrigger value="employee">Employee Certifications</TabsTrigger>
          <TabsTrigger value="expiring">Expiring Soon</TabsTrigger>
        </TabsList>

        <TabsContent value="catalog" className="space-y-3">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Issuing Body</TableHead>
                    <TableHead>Validity</TableHead>
                    <TableHead>Active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {catalog.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        {catalogQuery.isLoading ? "Loading..." : "No certifications defined"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    catalog.map((c: any) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.code || "—"}</TableCell>
                        <TableCell>{c.name}</TableCell>
                        <TableCell>{c.issuingBody || "—"}</TableCell>
                        <TableCell>{c.validityMonths ? `${c.validityMonths} months` : "No expiry"}</TableCell>
                        <TableCell>{c.isActive ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="employee" className="space-y-3">
          <div className="flex gap-3">
            <Select value={empCertStatus} onValueChange={setEmpCertStatus}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="pending_renewal">Pending Renewal</SelectItem>
                <SelectItem value="revoked">Revoked</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Worker</TableHead>
                    <TableHead>Certification</TableHead>
                    <TableHead>Obtained</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead>Renewal</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {empCerts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        {empCertsQuery.isLoading ? "Loading..." : "No employee certifications found"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    empCerts.map((ec: any) => (
                      <TableRow key={ec.id}>
                        <TableCell>Worker #{ec.workerId}</TableCell>
                        <TableCell>Cert #{ec.certificationId}</TableCell>
                        <TableCell>{ec.obtainedDate || "—"}</TableCell>
                        <TableCell>{ec.expiryDate || "No expiry"}</TableCell>
                        <TableCell>{ec.renewalDate || "—"}</TableCell>
                        <TableCell><Badge variant={certStatusVariant(ec.status)}>{ec.status.replace("_", " ")}</Badge></TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expiring" className="space-y-3">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Worker</TableHead>
                    <TableHead>Certification</TableHead>
                    <TableHead>Expiry Date</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expiring.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        No certifications expiring soon
                      </TableCell>
                    </TableRow>
                  ) : (
                    expiring.map((ec: any) => (
                      <TableRow key={ec.id}>
                        <TableCell>Worker #{ec.workerId}</TableCell>
                        <TableCell>Cert #{ec.certificationId}</TableCell>
                        <TableCell className="text-orange-500 font-medium">{ec.expiryDate}</TableCell>
                        <TableCell><Badge variant={certStatusVariant(ec.status)}>{ec.status.replace("_", " ")}</Badge></TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
