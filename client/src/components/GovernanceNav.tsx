/**
 * Governance Navigation Component
 * 
 * Navigation for agent governance features.
 */

import React from 'react';
import { Link, useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import { Shield, Settings, FileText, BarChart3 } from 'lucide-react';

export function GovernanceNav() {
  const [location] = useLocation();

  const navItems = [
    {
      label: 'Agents',
      href: '/governance/agents',
      icon: Shield,
      description: 'Manage and monitor agents',
    },
    {
      label: 'Policies',
      href: '/policies',
      icon: FileText,
      description: 'Policy management',
    },
    {
      label: 'Compliance',
      href: '/compliance-export',
      icon: BarChart3,
      description: 'Compliance reports',
    },
    {
      label: 'Settings',
      href: '/settings',
      icon: Settings,
      description: 'Governance settings',
    },
  ];

  return (
    <nav className="space-y-2">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = location === item.href || location.startsWith(item.href + '/');

        return (
          <Link key={item.href} href={item.href}>
            <a
              className={cn(
                'flex items-center gap-3 px-4 py-2 rounded-lg transition-colors',
                isActive
                  ? 'bg-blue-100 text-blue-900 dark:bg-blue-900 dark:text-blue-100'
                  : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
              )}
            >
              <Icon className="w-5 h-5" />
              <div>
                <p className="font-medium">{item.label}</p>
                <p className="text-xs opacity-75">{item.description}</p>
              </div>
            </a>
          </Link>
        );
      })}
    </nav>
  );
}
