import { useState } from 'react';
import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Search, BookOpen, Plus, Eye, Clock } from 'lucide-react';

export default function WikiPage() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<number | undefined>();

  // Fetch data
  const { data: categories = [] } = trpc.wiki.getCategories.useQuery();
  const { data: pages = [] } = trpc.wiki.getPages.useQuery({
    categoryId: selectedCategory,
  });
  const { data: popularPages = [] } = trpc.wiki.getPopularPages.useQuery({
    limit: 5,
  });
  const { data: recentPages = [] } = trpc.wiki.getRecentPages.useQuery({
    limit: 5,
  });
  const { data: searchResults = [] } = trpc.wiki.searchPages.useQuery(
    { query: searchQuery },
    { enabled: searchQuery.length > 0 }
  );

  const displayPages = searchQuery ? searchResults : pages;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="container max-w-6xl mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <BookOpen className="w-8 h-8 text-primary" />
              <h1 className="text-3xl font-bold">Wiki</h1>
            </div>
            <Button
              onClick={() => setLocation('/wiki/edit/new')}
              className="gap-2"
            >
              <Plus className="w-4 h-4" />
              New Page
            </Button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder="Search wiki pages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
      </div>

      <div className="container max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            {/* Categories */}
            <div className="mb-8">
              <h2 className="font-semibold mb-4">Categories</h2>
              <div className="space-y-2">
                <Button
                  variant={selectedCategory === undefined ? 'default' : 'outline'}
                  className="w-full justify-start"
                  onClick={() => setSelectedCategory(undefined)}
                >
                  All Categories
                </Button>
                {categories.map((category) => (
                  <Button
                    key={category.id}
                    variant={
                      selectedCategory === category.id ? 'default' : 'outline'
                    }
                    className="w-full justify-start"
                    onClick={() => setSelectedCategory(category.id)}
                  >
                    {category.name}
                  </Button>
                ))}
              </div>
            </div>

            {/* Popular Pages */}
            <div className="mb-8">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <Eye className="w-4 h-4" />
                Popular
              </h3>
              <div className="space-y-2">
                {popularPages.map((page) => (
                  <Button
                    key={page.id}
                    variant="ghost"
                    className="w-full justify-start text-left h-auto py-2 px-2 text-sm"
                    onClick={() => setLocation(`/wiki/${page.slug}`)}
                  >
                    <div className="truncate">{page.title}</div>
                  </Button>
                ))}
              </div>
            </div>

            {/* Recent Pages */}
            <div>
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Recent
              </h3>
              <div className="space-y-2">
                {recentPages.map((page) => (
                  <Button
                    key={page.id}
                    variant="ghost"
                    className="w-full justify-start text-left h-auto py-2 px-2 text-sm"
                    onClick={() => setLocation(`/wiki/${page.slug}`)}
                  >
                    <div className="truncate">{page.title}</div>
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            {displayPages.length === 0 ? (
              <Card className="p-12 text-center">
                <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">
                  {searchQuery ? 'No results found' : 'No pages yet'}
                </h3>
                <p className="text-muted-foreground mb-4">
                  {searchQuery
                    ? `Try a different search term`
                    : `Start by creating a new wiki page`}
                </p>
                {!searchQuery && (
                  <Button
                    onClick={() => setLocation('/wiki/edit/new')}
                    className="gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Create First Page
                  </Button>
                )}
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {displayPages.map((page) => (
                  <Card
                    key={page.id}
                    className="p-4 hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => setLocation(`/wiki/${page.slug}`)}
                  >
                    <h3 className="font-semibold mb-2 line-clamp-2">
                      {page.title}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4 line-clamp-3">
                      {page.content.substring(0, 150)}...
                    </p>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Eye className="w-3 h-3" />
                        {page.views} views
                      </span>
                      <span>
                        {new Date(page.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
