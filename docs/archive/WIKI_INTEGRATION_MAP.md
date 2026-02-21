# Wiki Backend-to-Frontend Integration Map

## Overview
This document maps the Wiki backend services to the frontend React components, showing how data flows from the database through tRPC endpoints to the UI.

## Database Schema → Backend Services → Frontend Components

### 1. WikiPage Component (client/src/pages/WikiPage.tsx)
Main landing page showing all wiki pages, categories, popular pages, and recent pages.

#### Backend Endpoints Used:
- wiki.getCategories - Fetch all wiki categories (Sidebar category buttons)
- wiki.getPages - Fetch published pages by category (Main content grid)
- wiki.searchPages - Full-text search on pages (Search results)
- wiki.getPopularPages - Get top pages by view count (Right sidebar "Popular" section)
- wiki.getRecentPages - Get recently updated pages (Right sidebar "Recent" section)

#### Key Features:
✅ Category filtering (sidebar buttons)
✅ Full-text search with live results
✅ Popular pages sidebar (sorted by views)
✅ Recent pages sidebar (sorted by update date)
✅ Page cards showing title, preview, views, and update date
✅ Click navigation to article page

---

### 2. WikiArticle Component (client/src/pages/WikiArticle.tsx)
Individual article view with markdown rendering, revision history, and edit/delete actions.

#### Backend Endpoints Used:
- wiki.getPageBySlug - Fetch page by URL slug (Main article content)
- wiki.getPageRevisions - Fetch revision history (Revision history panel)
- wiki.revertToRevision - Revert to old version (Revert button in revision list)
- wiki.deletePage - Delete page (Delete button)

#### Key Features:
✅ Markdown rendering with Streamdown component
✅ View counter (increments on each page load)
✅ Version history display with timestamps
✅ Revert to previous version functionality
✅ Edit button (redirects to editor)
✅ Delete button with confirmation dialog
✅ 404 error handling for missing pages

---

### 3. WikiEditor Component (client/src/pages/WikiEditor.tsx)
Create and edit wiki pages with markdown support and live preview.

#### Backend Endpoints Used:
- wiki.getCategories - Fetch categories for dropdown (Category selector)
- wiki.getPageBySlug - Fetch page for editing (Edit mode form population)
- wiki.createPage - Create new page (Save button - new page)
- wiki.updatePage - Update existing page (Save button - edit mode)
- wiki.publishPage - Publish page (Publish button)

#### Key Features:
✅ Create new pages (auto-generates slug from title)
✅ Edit existing pages
✅ Category selection dropdown
✅ Markdown editor with live preview
✅ Publish/unpublish functionality
✅ Automatic version tracking
✅ Form validation (title and content required)
✅ Toast notifications for success/error feedback

---

## tRPC Router Endpoints Summary

### Public Endpoints (No Authentication Required)
- wiki.getCategories - Get all categories
- wiki.getPages - Get published pages (optionally filtered by category)
- wiki.getPageBySlug - Get single page by slug
- wiki.searchPages - Search pages by title/content
- wiki.getPopularPages - Get top pages by views
- wiki.getRecentPages - Get recently updated pages
- wiki.getPageRevisions - Get revision history for a page

### Protected Endpoints (Authentication Required)
- wiki.createPage - Create new page
- wiki.updatePage - Update existing page
- wiki.deletePage - Delete page
- wiki.publishPage - Publish page
- wiki.unpublishPage - Unpublish page
- wiki.revertToRevision - Revert to previous version

---

## Integration Status: ✅ COMPLETE

All Wiki backend services are properly mapped to frontend components:
✅ WikiPage component wired to categories, pages, search, popular, and recent queries
✅ WikiArticle component wired to page fetch, revision history, and delete/revert mutations
✅ WikiEditor component wired to create, update, and publish mutations
✅ All tRPC endpoints properly defined and tested
✅ Database schema properly set up with wiki_pages, wiki_categories, and wiki_revisions tables
✅ Authentication and authorization properly implemented
✅ Error handling and loading states in place
✅ Toast notifications for user feedback
