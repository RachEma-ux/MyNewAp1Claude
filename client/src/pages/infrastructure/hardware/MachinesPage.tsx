import { useState } from "react";
import { Cog, Plus, Search, Play, Pause, AlertCircle } from "lucide-react";
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

const mockMachines = [
  {
    id: 1,
    name: "CNC-MILL-01",
    type: "CNC Machine",
    model: "Haas VF-4",
    status: "running",
    runtime: "8.5 hours",
    efficiency: 94,
    lastMaintenance: "2 weeks ago",
    nextMaintenance: "in 2 weeks",
  },
  {
    id: 2,
    name: "3D-PRINTER-LAB",
    type: "3D Printer",
    model: "Prusa i3 MK3S+",
    status: "idle",
    runtime: "0 hours",
    efficiency: 100,
    lastMaintenance: "1 month ago",
    nextMaintenance: "in 2 months",
  },
  {
    id: 3,
    name: "LASER-CUTTER-01",
    type: "Laser Cutter",
    model: "Epilog Fusion Pro",
    status: "running",
    runtime: "3.2 hours",
    efficiency: 89,
    lastMaintenance: "3 weeks ago",
    nextMaintenance: "in 1 week",
  },
  {
    id: 4,
    name: "INJECTION-MOLD-02",
    type: "Injection Molding",
    model: "Engel e-motion 310",
    status: "maintenance",
    runtime: "0 hours",
    efficiency: 0,
    lastMaintenance: "today",
    nextMaintenance: "in 3 months",
  },
];

export default function MachinesPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filteredMachines = mockMachines.filter((machine) => {
    const matchesSearch =
      machine.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      machine.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      machine.model.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || machine.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "running":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      case "idle":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "maintenance":
        return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      case "error":
        return "bg-red-500/10 text-red-500 border-red-500/20";
      default:
        return "bg-gray-500/10 text-gray-500 border-gray-500/20";
    }
  };

  const getEfficiencyColor = (efficiency: number) => {
    if (efficiency >= 90) return "text-green-500";
    if (efficiency >= 70) return "text-yellow-500";
    return "text-red-500";
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Cog className="h-8 w-8" />
            Machines
          </h1>
          <p className="text-muted-foreground mt-1">
            Industrial and manufacturing equipment monitoring
          </p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add Machine
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Machines</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mockMachines.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Running</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">
              {mockMachines.filter((m) => m.status === "running").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Avg Efficiency</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">91%</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Maintenance Due</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-500 flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              1
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Machine Inventory</CardTitle>
          <CardDescription>Operational status and maintenance tracking</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, type, or model..."
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
                variant={statusFilter === "running" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("running")}
              >
                Running
              </Button>
              <Button
                variant={statusFilter === "idle" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("idle")}
              >
                Idle
              </Button>
            </div>
          </div>

          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Machine</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Runtime</TableHead>
                  <TableHead>Efficiency</TableHead>
                  <TableHead>Last Maintenance</TableHead>
                  <TableHead>Next Maintenance</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMachines.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      No machines found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredMachines.map((machine) => (
                    <TableRow key={machine.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{machine.name}</div>
                          <div className="text-sm text-muted-foreground">{machine.type}</div>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{machine.model}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getStatusColor(machine.status)}>
                          <div className="flex items-center gap-1">
                            {machine.status === "running" && <Play className="h-3 w-3" />}
                            {machine.status === "idle" && <Pause className="h-3 w-3" />}
                            {machine.status}
                          </div>
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono">{machine.runtime}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className={`text-sm font-medium ${getEfficiencyColor(machine.efficiency)}`}>
                            {machine.efficiency}%
                          </div>
                          <Progress value={machine.efficiency} className="h-1" />
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{machine.lastMaintenance}</TableCell>
                      <TableCell className="text-muted-foreground">{machine.nextMaintenance}</TableCell>
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
