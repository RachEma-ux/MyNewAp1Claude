/**
 * Monitoring Dashboard Page
 * 
 * Real-time monitoring and metrics visualization.
 */

import React, { useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, AlertCircle, CheckCircle, TrendingUp } from 'lucide-react';

interface MetricPoint {
  timestamp: Date;
  name: string;
  value: number;
  tags?: Record<string, string>;
}

export function MonitoringDashboard() {
  const [refreshInterval, setRefreshInterval] = useState(5000);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Fetch health status
  const { data: health, refetch: refetchHealth } = trpc.logging.getHealth.useQuery();

  // Fetch metrics
  const { data: metricsData, refetch: refetchMetrics } = trpc.logging.getMetrics.useQuery({
    limit: 100,
  });

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      refetchHealth();
      refetchMetrics();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, refetchHealth, refetchMetrics]);

  const handleManualRefresh = () => {
    refetchHealth();
    refetchMetrics();
  };

  const metrics = metricsData?.metrics || [];

  // Group metrics by name
  const metricsByName = metrics.reduce((acc, metric) => {
    if (!acc[metric.name]) {
      acc[metric.name] = [];
    }
    acc[metric.name].push(metric);
    return acc;
  }, {} as Record<string, MetricPoint[]>);

  return (
    <div className="container mx-auto py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Monitoring Dashboard</h1>
          <p className="text-gray-600 mt-2">Real-time system metrics and health status</p>
        </div>
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualRefresh}
            className="flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
          <Button
            variant={autoRefresh ? 'default' : 'outline'}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? 'Auto' : 'Manual'}
          </Button>
        </div>
      </div>

      {/* Health Status */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>System Health</CardTitle>
          <CardDescription>Current system status and connectivity</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <CheckCircle className="w-8 h-8 text-green-500" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Status</p>
                <p className="font-semibold">{health?.status || 'Unknown'}</p>
              </div>
            </div>

            <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <TrendingUp className="w-8 h-8 text-blue-500" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Metrics</p>
                <p className="font-semibold">{health?.metrics?.total || 0}</p>
              </div>
            </div>

            <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <AlertCircle className="w-8 h-8 text-yellow-500" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Last Updated</p>
                <p className="font-semibold text-xs">
                  {health?.timestamp ? new Date(health.timestamp).toLocaleTimeString() : 'N/A'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <Badge variant="outline">Refresh: {refreshInterval / 1000}s</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Metrics */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {Object.entries(metricsByName).map(([name, points]) => {
          const latest = points[points.length - 1];
          const avg = points.reduce((sum, p) => sum + p.value, 0) / points.length;
          const max = Math.max(...points.map(p => p.value));
          const min = Math.min(...points.map(p => p.value));

          return (
            <Card key={name}>
              <CardHeader>
                <CardTitle className="text-lg">{name}</CardTitle>
                <CardDescription>Metric statistics</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Current</p>
                    <p className="text-2xl font-bold">{latest?.value.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Average</p>
                    <p className="text-2xl font-bold">{avg.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Max</p>
                    <p className="text-lg font-semibold text-green-600">{max.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Min</p>
                    <p className="text-lg font-semibold text-blue-600">{min.toFixed(2)}</p>
                  </div>
                </div>

                {latest?.tags && Object.keys(latest.tags).length > 0 && (
                  <div className="pt-4 border-t">
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">Tags</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(latest.tags).map(([key, value]) => (
                        <Badge key={key} variant="secondary">
                          {key}: {value}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Empty State */}
      {metrics.length === 0 && (
        <Card>
          <CardContent className="pt-8 text-center">
            <p className="text-gray-500">No metrics available yet. Metrics will appear as they are collected.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
