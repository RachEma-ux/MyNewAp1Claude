import { router, publicProcedure, protectedProcedure } from '../_core/trpc';
import { z } from 'zod';
import { WikiService } from '../wiki/wiki-service';

export const wikiRouter = router({
  /**
   * Get all wiki categories
   */
  getCategories: publicProcedure.query(async () => {
    return WikiService.getCategories();
  }),

  /**
   * Get all published wiki pages
   */
  getPages: publicProcedure
    .input(
      z.object({
        categoryId: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      return WikiService.getPages(input.categoryId);
    }),

  /**
   * Get a specific wiki page by slug
   */
  getPageBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      return WikiService.getPageBySlug(input.slug);
    }),

  /**
   * Search wiki pages
   */
  searchPages: publicProcedure
    .input(z.object({ query: z.string().min(1) }))
    .query(async ({ input }) => {
      return WikiService.searchPages(input.query);
    }),

  /**
   * Get popular pages
   */
  getPopularPages: publicProcedure
    .input(
      z.object({
        limit: z.number().default(10),
      })
    )
    .query(async ({ input }) => {
      return WikiService.getPopularPages(input.limit);
    }),

  /**
   * Get recent pages
   */
  getRecentPages: publicProcedure
    .input(
      z.object({
        limit: z.number().default(10),
      })
    )
    .query(async ({ input }) => {
      return WikiService.getRecentPages(input.limit);
    }),

  /**
   * Create a new wiki page (protected)
   */
  createPage: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1),
        slug: z.string().optional(),
        content: z.string().min(1),
        categoryId: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return WikiService.createPage({
        ...input,
        authorId: ctx.user.id,
        isPublished: false,
      });
    }),

  /**
   * Update a wiki page (protected)
   */
  updatePage: protectedProcedure
    .input(
      z.object({
        pageId: z.number(),
        title: z.string().optional(),
        content: z.string().optional(),
        categoryId: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { pageId, ...data } = input;
      return WikiService.updatePage(pageId, data);
    }),

  /**
   * Delete a wiki page (protected)
   */
  deletePage: protectedProcedure
    .input(z.object({ pageId: z.number() }))
    .mutation(async ({ input }) => {
      await WikiService.deletePage(input.pageId);
      return { success: true };
    }),

  /**
   * Publish a wiki page (protected)
   */
  publishPage: protectedProcedure
    .input(z.object({ pageId: z.number() }))
    .mutation(async ({ input }) => {
      return WikiService.publishPage(input.pageId);
    }),

  /**
   * Unpublish a wiki page (protected)
   */
  unpublishPage: protectedProcedure
    .input(z.object({ pageId: z.number() }))
    .mutation(async ({ input }) => {
      return WikiService.unpublishPage(input.pageId);
    }),

  /**
   * Get revision history for a page
   */
  getPageRevisions: publicProcedure
    .input(z.object({ pageId: z.number() }))
    .query(async ({ input }) => {
      return WikiService.getPageRevisions(input.pageId);
    }),

  /**
   * Revert page to a specific revision (protected)
   */
  revertToRevision: protectedProcedure
    .input(
      z.object({
        pageId: z.number(),
        revisionNumber: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      return WikiService.revertToRevision(
        input.pageId,
        input.revisionNumber
      );
    }),
});
