import { mysqlTable, varchar, text, int, timestamp, boolean, enum as mysqlEnum, index } from 'drizzle-orm/mysql-core';
import { relations } from 'drizzle-orm';
import { users } from './schema';

// Wiki Categories
export const wikiCategories = mysqlTable(
  'wiki_categories',
  {
    id: int().primaryKey().autoincrement(),
    name: varchar({ length: 255 }).notNull().unique(),
    description: text(),
    icon: varchar({ length: 50 }), // lucide-react icon name
    displayOrder: int('display_order').default(0),
    createdAt: timestamp().defaultNow(),
    updatedAt: timestamp().defaultNow().onUpdateNow(),
  },
  (table) => ({
    displayOrderIdx: index('wiki_categories_display_order_idx').on(table.displayOrder),
  })
);

// Wiki Pages
export const wikiPages = mysqlTable(
  'wiki_pages',
  {
    id: int().primaryKey().autoincrement(),
    title: varchar({ length: 255 }).notNull(),
    slug: varchar({ length: 255 }).notNull().unique(),
    content: text().notNull(), // markdown content
    categoryId: int().references(() => wikiCategories.id),
    authorId: int().references(() => users.id),
    version: int().default(1),
    isPublished: boolean().default(false),
    views: int().default(0),
    createdAt: timestamp().defaultNow(),
    updatedAt: timestamp().defaultNow().onUpdateNow(),
  },
  (table) => ({
    slugIdx: index('wiki_pages_slug_idx').on(table.slug),
    categoryIdx: index('wiki_pages_category_idx').on(table.categoryId),
    authorIdx: index('wiki_pages_author_idx').on(table.authorId),
    publishedIdx: index('wiki_pages_published_idx').on(table.isPublished),
  })
);

// Wiki Revisions (Version History)
export const wikiRevisions = mysqlTable(
  'wiki_revisions',
  {
    id: int().primaryKey().autoincrement(),
    pageId: int().notNull().references(() => wikiPages.id, { onDelete: 'cascade' }),
    content: text().notNull(), // markdown content at this revision
    authorId: int().references(() => users.id),
    reason: varchar({ length: 500 }), // why this revision was made
    revisionNumber: int().notNull(),
    createdAt: timestamp().defaultNow(),
  },
  (table) => ({
    pageIdx: index('wiki_revisions_page_idx').on(table.pageId),
    authorIdx: index('wiki_revisions_author_idx').on(table.authorId),
    revisionIdx: index('wiki_revisions_number_idx').on(table.revisionNumber),
  })
);

// Wiki Attachments (Images, PDFs, etc.)
export const wikiAttachments = mysqlTable(
  'wiki_attachments',
  {
    id: int().primaryKey().autoincrement(),
    pageId: int().notNull().references(() => wikiPages.id, { onDelete: 'cascade' }),
    filename: varchar({ length: 255 }).notNull(),
    url: varchar({ length: 500 }).notNull(), // S3 URL or similar
    type: varchar({ length: 50 }), // image, pdf, document, etc.
    size: int(), // file size in bytes
    uploadedBy: int().references(() => users.id),
    createdAt: timestamp().defaultNow(),
  },
  (table) => ({
    pageIdx: index('wiki_attachments_page_idx').on(table.pageId),
    uploadedIdx: index('wiki_attachments_uploaded_idx').on(table.uploadedBy),
  })
);

// Relations
export const wikiCategoriesRelations = relations(wikiCategories, ({ many }) => ({
  pages: many(wikiPages),
}));

export const wikiPagesRelations = relations(wikiPages, ({ one, many }) => ({
  category: one(wikiCategories, {
    fields: [wikiPages.categoryId],
    references: [wikiCategories.id],
  }),
  author: one(users, {
    fields: [wikiPages.authorId],
    references: [users.id],
  }),
  revisions: many(wikiRevisions),
  attachments: many(wikiAttachments),
}));

export const wikiRevisionsRelations = relations(wikiRevisions, ({ one }) => ({
  page: one(wikiPages, {
    fields: [wikiRevisions.pageId],
    references: [wikiPages.id],
  }),
  author: one(users, {
    fields: [wikiRevisions.authorId],
    references: [users.id],
  }),
}));

export const wikiAttachmentsRelations = relations(wikiAttachments, ({ one }) => ({
  page: one(wikiPages, {
    fields: [wikiAttachments.pageId],
    references: [wikiPages.id],
  }),
  uploadedBy: one(users, {
    fields: [wikiAttachments.uploadedBy],
    references: [users.id],
  }),
}));

// Types
export type WikiCategory = typeof wikiCategories.$inferSelect;
export type InsertWikiCategory = typeof wikiCategories.$inferInsert;

export type WikiPage = typeof wikiPages.$inferSelect;
export type InsertWikiPage = typeof wikiPages.$inferInsert;

export type WikiRevision = typeof wikiRevisions.$inferSelect;
export type InsertWikiRevision = typeof wikiRevisions.$inferInsert;

export type WikiAttachment = typeof wikiAttachments.$inferSelect;
export type InsertWikiAttachment = typeof wikiAttachments.$inferInsert;
