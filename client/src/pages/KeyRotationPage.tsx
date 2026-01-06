/**
 * Key Rotation Management Page
 * 
 * Provides UI for managing:
 * - Service certificates (TLS, mTLS, signing)
 * - Attestation keys
 * - Rotation schedules and policies
 * - Audit logs and compliance tracking
 */

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, Clock, AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export function KeyRotationPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");

  // Query data
  const { data: rotationSummary, isLoading: summaryLoading } =
    trpc.keyRotation.rotations.getStatusSummary.useQuery();
  const { data: rotations, isLoading: rotationsLoading } = trpc.keyRotation.rotations.list.useQuery();
  const { data: policies, isLoading: policiesLoading } =
    trpc.keyRotation.policies.list.useQuery();
  const { data: certs, isLoading: certsLoading } = trpc.keyRotation.serviceCertificates.list.useQuery(
    { serviceName: "all" }
  );
  const { data: keys, isLoading: keysLoading } = trpc.keyRotation.attestationKeys.list.useQuery();

  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">Please log in to access Key Rotation management</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Key Rotation Management</h1>
        <p className="text-muted-foreground">
          Manage service certificates, attestation keys, and rotation policies
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="certificates">Certificates</TabsTrigger>
          <TabsTrigger value="keys">Attestation Keys</TabsTrigger>
          <TabsTrigger value="policies">Policies</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {summaryLoading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">Loading rotation status...</p>
            </div>
          ) : rotationSummary?.summary ? (
            <>
              {/* Status Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">Total Rotations</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{rotationSummary.summary.total}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Clock className="w-4 h-4 text-yellow-500" />
                      Pending
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{rotationSummary.summary.pending}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 text-blue-500" />
                      In Progress
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{rotationSummary.summary.inProgress}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      Completed
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{rotationSummary.summary.completed}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-500" />
                      Failed
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{rotationSummary.summary.failed}</div>
                  </CardContent>
                </Card>
              </div>

              {/* Recent Rotations */}
              <Card>
                <CardHeader>
                  <CardTitle>Recent Rotations</CardTitle>
                  <CardDescription>Latest key rotation events</CardDescription>
                </CardHeader>
                <CardContent>
                  {rotationsLoading ? (
                    <p className="text-muted-foreground">Loading rotations...</p>
                  ) : rotations?.rotations && rotations.rotations.length > 0 ? (
                    <div className="space-y-4">
                      {rotations.rotations.slice(0, 5).map((rotation) => (
                        <div
                          key={rotation.id}
                          className="flex items-center justify-between p-4 border rounded-lg"
                        >
                          <div className="flex-1">
                            <p className="font-medium">{rotation.targetName}</p>
                            <p className="text-sm text-muted-foreground">
                              {rotation.rotationType} • {rotation.reason}
                            </p>
                          </div>
                          <Badge
                            variant={
                              rotation.status === "completed"
                                ? "default"
                                : rotation.status === "failed"
                                  ? "destructive"
                                  : rotation.status === "in_progress"
                                    ? "secondary"
                                    : "outline"
                            }
                          >
                            {rotation.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No rotations yet</p>
                  )}
                </CardContent>
              </Card>
            </>
          ) : null}
        </TabsContent>

        {/* Certificates Tab */}
        <TabsContent value="certificates" className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Service Certificates</h2>
            <Button onClick={() => toast.info("Feature coming soon")}>
              Add Certificate
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>TLS Certificates</CardTitle>
              <CardDescription>Manage TLS and mTLS certificates</CardDescription>
            </CardHeader>
            <CardContent>
              {certsLoading ? (
                <p className="text-muted-foreground">Loading certificates...</p>
              ) : certs?.certificates && certs.certificates.length > 0 ? (
                <div className="space-y-4">
                  {certs.certificates.map((cert) => (
                    <div key={cert.id} className="p-4 border rounded-lg">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-medium">{cert.serviceName}</p>
                          <p className="text-sm text-muted-foreground">{cert.subject}</p>
                          <div className="mt-2 flex gap-2 text-xs">
                            <Badge variant="outline">{cert.certificateType}</Badge>
                            <Badge variant="outline">
                              Expires:{" "}
                              {new Date(cert.expiresAt).toLocaleDateString()}
                            </Badge>
                          </div>
                        </div>
                        <Badge
                          variant={cert.status === "active" ? "default" : "secondary"}
                        >
                          {cert.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">No certificates found</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Attestation Keys Tab */}
        <TabsContent value="keys" className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Attestation Keys</h2>
            <Button onClick={() => toast.info("Feature coming soon")}>
              Generate Key
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Active Keys</CardTitle>
              <CardDescription>Keys used for signing agent attestations</CardDescription>
            </CardHeader>
            <CardContent>
              {keysLoading ? (
                <p className="text-muted-foreground">Loading keys...</p>
              ) : keys?.keys && keys.keys.length > 0 ? (
                <div className="space-y-4">
                  {keys.keys.map((key) => (
                    <div key={key.id} className="p-4 border rounded-lg">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-medium">{key.keyName}</p>
                          <p className="text-sm text-muted-foreground">
                            {key.keyType} • Key ID: {key.keyId.substring(0, 16)}...
                          </p>
                          <div className="mt-2 flex gap-2 text-xs">
                            <Badge variant="outline">
                              Usage: {key.usageCount || 0}
                            </Badge>
                            {key.expiresAt && (
                              <Badge variant="outline">
                                Expires:{" "}
                                {new Date(key.expiresAt).toLocaleDateString()}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <Badge
                          variant={key.status === "active" ? "default" : "secondary"}
                        >
                          {key.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">No keys found</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Policies Tab */}
        <TabsContent value="policies" className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Rotation Policies</h2>
            <Button onClick={() => toast.info("Feature coming soon")}>
              Create Policy
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Active Policies</CardTitle>
              <CardDescription>Automatic rotation policies</CardDescription>
            </CardHeader>
            <CardContent>
              {policiesLoading ? (
                <p className="text-muted-foreground">Loading policies...</p>
              ) : policies?.policies && policies.policies.length > 0 ? (
                <div className="space-y-4">
                  {policies.policies.map((policy) => (
                    <div key={policy.id} className="p-4 border rounded-lg">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-medium">{policy.policyName}</p>
                          <p className="text-sm text-muted-foreground">
                            {policy.description}
                          </p>
                          <div className="mt-2 flex gap-2 text-xs">
                            <Badge variant="outline">
                              Rotate every {policy.rotationIntervalDays} days
                            </Badge>
                            <Badge variant="outline">
                              Overlap: {policy.overlapWindowDays} days
                            </Badge>
                            {policy.autoRotate && (
                              <Badge variant="default">Auto-rotate</Badge>
                            )}
                          </div>
                        </div>
                        <Badge
                          variant={policy.isActive ? "default" : "secondary"}
                        >
                          {policy.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">No policies found</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default KeyRotationPage;
