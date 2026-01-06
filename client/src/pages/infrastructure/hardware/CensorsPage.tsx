import { useState } from "react";
import { Gauge, Plus, Search, Thermometer, Droplets, Wind, AlertTriangle } from "lucide-react";
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

const mockSensors = [
  {
    id: 1,
    name: "TEMP-SENSOR-DC1",
    type: "Temperature",
    location: "Data Center 1",
    value: "22°C",
    status: "active",
    lastUpdate: "30s ago",
    threshold: "18-25°C",
    alert: false,
  },
  {
    id: 2,
    name: "HUMIDITY-SENSOR-DC1",
    type: "Humidity",
    location: "Data Center 1",
    value: "45%",
    status: "active",
    lastUpdate: "30s ago",
    threshold: "30-60%",
    alert: false,
  },
  {
    id: 3,
    name: "TEMP-SENSOR-SERVER-ROOM",
    type: "Temperature",
    location: "Server Room",
    value: "28°C",
    status: "warning",
    lastUpdate: "1m ago",
    threshold: "18-25°C",
    alert: true,
  },
  {
    id: 4,
    name: "AIRFLOW-SENSOR-DC1",
    type: "Airflow",
    location: "Data Center 1",
    value: "850 CFM",
    status: "active",
    lastUpdate: "45s ago",
    threshold: ">500 CFM",
    alert: false,
  },
];

export default function CensorsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filteredSensors = mockSensors.filter((sensor) => {
    const matchesSearch =
      sensor.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sensor.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sensor.location.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || sensor.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      case "warning":
        return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      case "error":
        return "bg-red-500/10 text-red-500 border-red-500/20";
      case "offline":
        return "bg-gray-500/10 text-gray-500 border-gray-500/20";
      default:
        return "bg-gray-500/10 text-gray-500 border-gray-500/20";
    }
  };

  const getSensorIcon = (type: string) => {
    switch (type) {
      case "Temperature":
        return <Thermometer className="h-4 w-4" />;
      case "Humidity":
        return <Droplets className="h-4 w-4" />;
      case "Airflow":
        return <Wind className="h-4 w-4" />;
      default:
        return <Gauge className="h-4 w-4" />;
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Gauge className="h-8 w-8" />
            Sensors
          </h1>
          <p className="text-muted-foreground mt-1">
            Monitor environmental and operational sensors
          </p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add Sensor
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Sensors</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mockSensors.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">
              {mockSensors.filter((s) => s.status === "active").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Warnings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-500">
              {mockSensors.filter((s) => s.status === "warning").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">
              {mockSensors.filter((s) => s.alert).length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sensor Monitoring</CardTitle>
          <CardDescription>Real-time environmental sensor data and alerts</CardDescription>
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
                variant={statusFilter === "active" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("active")}
              >
                Active
              </Button>
              <Button
                variant={statusFilter === "warning" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("warning")}
              >
                Warnings
              </Button>
            </div>
          </div>

          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sensor</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Current Value</TableHead>
                  <TableHead>Threshold</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Update</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSensors.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No sensors found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSensors.map((sensor) => (
                    <TableRow key={sensor.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium flex items-center gap-2">
                            {sensor.alert && (
                              <AlertTriangle className="h-4 w-4 text-red-500" />
                            )}
                            {sensor.name}
                          </div>
                          <div className="text-sm text-muted-foreground">{sensor.location}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getSensorIcon(sensor.type)}
                          <span>{sensor.type}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`font-mono font-medium ${sensor.alert ? "text-red-500" : ""}`}>
                          {sensor.value}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{sensor.threshold}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getStatusColor(sensor.status)}>
                          {sensor.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{sensor.lastUpdate}</TableCell>
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
