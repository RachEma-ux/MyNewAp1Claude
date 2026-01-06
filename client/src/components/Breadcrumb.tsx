/**
 * Breadcrumb Navigation Component
 * 
 * Displays navigation breadcrumbs for current page location.
 */

import React from 'react';
import { Link } from 'wouter';
import { ChevronRight, Home } from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
  current?: boolean;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-6">
      <Link href="/">
        <a className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-gray-200 transition-colors">
          <Home className="w-4 h-4" />
          <span>Home</span>
        </a>
      </Link>

      {items.map((item, index) => (
        <React.Fragment key={index}>
          <ChevronRight className="w-4 h-4" />
          {item.href && !item.current ? (
            <Link href={item.href}>
              <a className="hover:text-gray-900 dark:hover:text-gray-200 transition-colors">
                {item.label}
              </a>
            </Link>
          ) : (
            <span className={item.current ? 'text-gray-900 dark:text-gray-100 font-medium' : ''}>
              {item.label}
            </span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}
