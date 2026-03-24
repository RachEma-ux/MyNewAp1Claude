/**
 * HR Letters & Certificates Page — Generate and manage HR letters
 */

import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Mail } from "lucide-react";

const statusColor: Record<string, string> = {
  draft: "bg-gray-500/10 text-gray-400",
  issued: "bg-green-500/10 text-green-500",
  revoked: "bg-red-500/10 text-red-500",
  expired: "bg-yellow-500/10 text-yellow-500",
};

export default function HRLettersCertificatesPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const letters = trpc.hr.directory.listLetters.useQuery({
    limit: 50,
    ...(statusFilter && statusFilter !== "all" ? { status: statusFilter } : {}),
    ...(typeFilter && typeFilter !== "all" ? { letterType: typeFilter } : {}),
  });

  if (letters.isLoading) {
    return <div className="p-6 max-w-7xl mx-auto"><div className="animate-pulse space-y-4"><div className="h-8 bg-muted rounded w-44" /><div className="h-40 bg-muted rounded" /></div></div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/hr/employee-records"><Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Mail className="w-6 h-6" /> HR Letters & Certificates</h1>
          <p className="text-muted-foreground">Generate and manage HR letters and certificates</p>
        </div>
      </div>

      <div className="flex gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="issued">Issued</SelectItem>
            <SelectItem value="revoked">Revoked</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="All types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="employment_verification">Employment Verification</SelectItem>
            <SelectItem value="salary_certificate">Salary Certificate</SelectItem>
            <SelectItem value="experience_letter">Experience Letter</SelectItem>
            <SelectItem value="noc">NOC</SelectItem>
            <SelectItem value="recommendation">Recommendation</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="offer">Offer</SelectItem>
            <SelectItem value="promotion">Promotion</SelectItem>
            <SelectItem value="transfer">Transfer</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3">
        {letters.data?.length === 0 && (
          <Card><CardContent className="p-4 text-muted-foreground">No letters or certificates found.</CardContent></Card>
        )}
        {letters.data?.map((letter) => (
          <Card key={letter.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <div className="font-medium">{letter.title}</div>
                <div className="flex gap-2">
                  <Badge variant="outline">{letter.letterType.replace(/_/g, " ")}</Badge>
                  <Badge className={statusColor[letter.status] ?? "bg-gray-500/10 text-gray-400"}>{letter.status}</Badge>
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                {letter.referenceNumber && <span>Ref: {letter.referenceNumber} | </span>}
                {letter.issueDate && <span>Issued: {letter.issueDate} | </span>}
                {letter.expiryDate && <span>Expires: {letter.expiryDate}</span>}
              </div>
              {letter.description && <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{letter.description}</div>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
