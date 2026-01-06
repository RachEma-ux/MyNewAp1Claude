import { useState } from "react";
import { Monitor, Plus, Search, Cpu, HardDrive, MemoryStick } from "lucide-react";
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

const mockComputers = [
  {
    id: 1,
    name: "DEV-WORKSTATION-01",
    type: "Desktop",
    os: "Windows 11 Pro",
    cpu: "Intel i9-13900K",
    ram: "64GB",
    storage: "2TB NVMe",
    status: "online",
    uptime: "15 days",
    assignedTo: "Engineering",
  },
  {
    id: 2,
    name: "DESIGN-MAC-PRO",
    type: "Workstation",
    os: "macOS Sonoma",
    cpu: "Apple M2 Ultra",
    ram: "128GB",
    storage: "4TB SSD",
    status: "online",
    uptime: "42 days",
    assignedTo: "Design Team",
  },
  {
    id: 3,
    name: "LAPTOP-SALES-05",
    type: "Laptop",
    os: "Windows 11",
    cpu: "Intel i7-12700H",
    ram: "32GB",
    storage: "1TB SSD",
    status: "offline",
    uptime: "0 days",
    assignedTo: "Sales",
  },
];

export default function PersonalComputersPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filteredComputers = mockComputers.filter((pc) => {
    const matchesSearch =
      pc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pc.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pc.assignedTo.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || pc.status === statusFilter;
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
      default:
        return "bg-gray-500/10 text-gray-500 border-gray-500/20";
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Monitor className="h-8 w-8" />
            Personal Computers
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage workstations, desktops, and laptops
          </p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add Computer
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Computers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mockComputers.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Online</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">
              {mockComputers.filter((c) => c.status === "online").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Avg Uptime</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">28d</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Offline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-500">
              {mockComputers.filter((c) => c.status === "offline").length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Computer Inventory</CardTitle>
          <CardDescription>Monitor system resources and status</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, type, or department..."
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
                variant={statusFilter === "offline" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("offline")}
              >
                Offline
              </Button>
            </div>
          </div>

          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Computer</TableHead>
                  <TableHead>OS</TableHead>
                  <TableHead>CPU</TableHead>
                  <TableHead>RAM</TableHead>
                  <TableHead>Storage</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Uptime</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredComputers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      No computers found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredComputers.map((pc) => (
                    <TableRow key={pc.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{pc.name}</div>
                          <div className="text-sm text-muted-foreground">{pc.type} • {pc.assignedTo}</div>
                        </div>
                      </TableCell>
                      <TableCell>{pc.os}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Cpu className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{pc.cpu}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <MemoryStick className="h-4 w-4 text-muted-foreground" />
                          <span>{pc.ram}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <HardDrive className="h-4 w-4 text-muted-foreground" />
                          <span>{pc.storage}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getStatusColor(pc.status)}>
                          {pc.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{pc.uptime}</TableCell>
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
