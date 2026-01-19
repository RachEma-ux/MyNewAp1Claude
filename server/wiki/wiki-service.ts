import { getDb } from '../db';
import {
  wikiPages,
  wikiCategories,
  wikiRevisions,
  wikiAttachments,
  type WikiPage,
  type InsertWikiPage,
  type WikiCategory,
  type WikiRevision,
} from '../../drizzle/wiki-schema';
import { eq, like, and, desc } from 'drizzle-orm';

export class WikiService {
  /**
   * Get all wiki categories
   */
  static async getCategories(): Promise<WikiCategory[]> {
    const db = getDb();
    if (!db) return [];
    return db
      .select()
      .from(wikiCategories)
      .orderBy(wikiCategories.displayOrder);
  }

  /**
   * Get all published wiki pages
   */
  static async getPages(categoryId?: number): Promise<WikiPage[]> {
    const db = getDb();
    if (!db) return [];
    const conditions = [eq(wikiPages.isPublished, true)];
    if (categoryId) {
      conditions.push(eq(wikiPages.categoryId, categoryId));
    }

    return db
      .select()
      .from(wikiPages)
      .where(and(...conditions))
      .orderBy(desc(wikiPages.createdAt));
  }

  /**
   * Get a specific wiki page by slug
   */
  static async getPageBySlug(slug: string): Promise<WikiPage | null> {
    const db = getDb();
    if (!db) return null;
    const result = await db
      .select()
      .from(wikiPages)
      .where(eq(wikiPages.slug, slug));

    if (result.length === 0) return null;

    // Increment view count
    await db
      .update(wikiPages)
      .set({ views: (result[0].views ?? 0) + 1 })
      .where(eq(wikiPages.id, result[0].id));

    return result[0];
  }

  /**
   * Search wiki pages by title or content
   */
  static async searchPages(query: string): Promise<WikiPage[]> {
    const db = getDb();
    if (!db) return [];
    const searchPattern = `%${query}%`;

    return db
      .select()
      .from(wikiPages)
      .where(
        and(
          eq(wikiPages.isPublished, true),
          like(wikiPages.title, searchPattern)
        )
      )
      .orderBy(desc(wikiPages.views));
  }

  /**
   * Create a new wiki page
   */
  static async createPage(
    data: InsertWikiPage & { content: string }
  ): Promise<WikiPage> {
    const db = getDb();
    if (!db) throw new Error('Database not available');

    // Generate slug from title if not provided
    const slug =
      data.slug ||
      data.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    const result = await db.insert(wikiPages).values({
      ...data,
      slug,
      version: 1,
    }).returning();

    return result[0];
  }

  /**
   * Update a wiki page
   */
  static async updatePage(
    pageId: number,
    data: Partial<InsertWikiPage>
  ): Promise<WikiPage> {
    const db = getDb();
    if (!db) throw new Error('Database not available');

    // Get current page to create revision
    const currentPage = await db
      .select()
      .from(wikiPages)
      .where(eq(wikiPages.id, pageId));

    if (currentPage.length === 0) {
      throw new Error('Page not found');
    }

    const page = currentPage[0];

    // If content is being updated, create a revision
    if (data.content && data.content !== page.content) {
      await db.insert(wikiRevisions).values({
        pageId,
        content: page.content,
        authorId: page.authorId,
        revisionNumber: page.version ?? 1,
      });
    }

    // Update the page
    const updated = await db
      .update(wikiPages)
      .set({
        ...data,
        version: (page.version ?? 1) + 1,
        updatedAt: new Date(),
      })
      .where(eq(wikiPages.id, pageId))
      .returning();

    return updated[0];
  }

  /**
   * Delete a wiki page
   */
  static async deletePage(pageId: number): Promise<void> {
    const db = getDb();
    if (!db) throw new Error('Database not available');
    await db.delete(wikiPages).where(eq(wikiPages.id, pageId));
  }

  /**
   * Get revision history for a page
   */
  static async getPageRevisions(pageId: number): Promise<WikiRevision[]> {
    const db = getDb();
    if (!db) return [];
    return db
      .select()
      .from(wikiRevisions)
      .where(eq(wikiRevisions.pageId, pageId))
      .orderBy(desc(wikiRevisions.createdAt));
  }

  /**
   * Revert page to a specific revision
   */
  static async revertToRevision(
    pageId: number,
    revisionNumber: number
  ): Promise<WikiPage> {
    const db = getDb();
    if (!db) throw new Error('Database not available');

    // Get the revision
    const revision = await db
      .select()
      .from(wikiRevisions)
      .where(
        and(
          eq(wikiRevisions.pageId, pageId),
          eq(wikiRevisions.revisionNumber, revisionNumber)
        )
      );

    if (revision.length === 0) {
      throw new Error('Revision not found');
    }

    // Update page with revision content
    return this.updatePage(pageId, {
      content: revision[0].content,
    });
  }

  /**
   * Publish a wiki page
   */
  static async publishPage(pageId: number): Promise<WikiPage> {
    return this.updatePage(pageId, {
      isPublished: true,
    });
  }

  /**
   * Unpublish a wiki page
   */
  static async unpublishPage(pageId: number): Promise<WikiPage> {
    return this.updatePage(pageId, {
      isPublished: false,
    });
  }

  /**
   * Get popular pages (by view count)
   */
  static async getPopularPages(limit: number = 10): Promise<WikiPage[]> {
    const db = getDb();
    if (!db) return [];
    return db
      .select()
      .from(wikiPages)
      .where(eq(wikiPages.isPublished, true))
      .orderBy(desc(wikiPages.views))
      .limit(limit);
  }

  /**
   * Get recent pages
   */
  static async getRecentPages(limit: number = 10): Promise<WikiPage[]> {
    const db = getDb();
    if (!db) return [];
    return db
      .select()
      .from(wikiPages)
      .where(eq(wikiPages.isPublished, true))
      .orderBy(desc(wikiPages.updatedAt))
      .limit(limit);
  }
}
