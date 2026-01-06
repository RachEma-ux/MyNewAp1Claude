import { useState } from "react";
import { Server, Plus, Search, Cpu, HardDrive, Activity, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";

const mockServers = [
  {
    id: 1,
    name: "PROD-WEB-01",
    type: "Web Server",
    os: "Ubuntu 22.04 LTS",
    cpu: "32 cores",
    ram: "128GB",
    storage: "4TB NVMe",
    status: "online",
    uptime: "120 days",
    cpuUsage: 45,
    ramUsage: 68,
    diskUsage: 42,
    location: "US-East-1",
  },
  {
    id: 2,
    name: "PROD-DB-01",
    type: "Database Server",
    os: "RHEL 9",
    cpu: "64 cores",
    ram: "256GB",
    storage: "10TB SSD",
    status: "online",
    uptime: "180 days",
    cpuUsage: 72,
    ramUsage: 85,
    diskUsage: 67,
    location: "US-East-1",
  },
  {
    id: 3,
    name: "DEV-API-02",
    type: "API Server",
    os: "Ubuntu 22.04 LTS",
    cpu: "16 cores",
    ram: "64GB",
    storage: "2TB SSD",
    status: "maintenance",
    uptime: "0 days",
    cpuUsage: 0,
    ramUsage: 0,
    diskUsage: 38,
    location: "US-West-2",
  },
];

export default function ServersPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filteredServers = mockServers.filter((server) => {
    const matchesSearch =
      server.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      server.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      server.location.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || server.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "online":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      case "offline":
        return "bg-gray-500/10 text-gray-500 border-gray-500/20";
      case "maintenance":
        return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      case "error":
        return "bg-red-500/10 text-red-500 border-red-500/20";
      default:
        return "bg-gray-500/10 text-gray-500 border-gray-500/20";
    }
  };

  const getUsageColor = (usage: number) => {
    if (usage >= 90) return "text-red-500";
    if (usage >= 75) return "text-yellow-500";
    return "text-green-500";
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Server className="h-8 w-8" />
            Servers
          </h1>
          <p className="text-muted-foreground mt-1">
            Monitor production and development servers
          </p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add Server
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Servers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mockServers.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Online</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">
              {mockServers.filter((s) => s.status === "online").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Avg Uptime</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">150d</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-500 flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              2
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Server Inventory</CardTitle>
          <CardDescription>Real-time server monitoring and health checks</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, type, or location..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant={statusFilter === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("all")}
              >
                All
              </Button>
              <Button
                variant={statusFilter === "online" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("online")}
              >
                Online
              </Button>
              <Button
                variant={statusFilter === "maintenance" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("maintenance")}
              >
                Maintenance
              </Button>
            </div>
          </div>

          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Server</TableHead>
                  <TableHead>Specs</TableHead>
                  <TableHead>CPU Usage</TableHead>
                  <TableHead>RAM Usage</TableHead>
                  <TableHead>Disk Usage</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Uptime</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredServers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      No servers found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredServers.map((server) => (
                    <TableRow key={server.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{server.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {server.type} • {server.location}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm space-y-1">
                          <div className="flex items-center gap-1">
                            <Cpu className="h-3 w-3 text-muted-foreground" />
                            <span>{server.cpu}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <HardDrive className="h-3 w-3 text-muted-foreground" />
                            <span>{server.ram}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className={`text-sm font-medium ${getUsageColor(server.cpuUsage)}`}>
                            {server.cpuUsage}%
                          </div>
                          <Progress value={server.cpuUsage} className="h-1" />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className={`text-sm font-medium ${getUsageColor(server.ramUsage)}`}>
                            {server.ramUsage}%
                          </div>
                          <Progress value={server.ramUsage} className="h-1" />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className={`text-sm font-medium ${getUsageColor(server.diskUsage)}`}>
                            {server.diskUsage}%
                          </div>
                          <Progress value={server.diskUsage} className="h-1" />
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getStatusColor(server.status)}>
                          {server.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{server.uptime}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm">
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
