import { pgTable, varchar, text, integer, serial, timestamp, boolean, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './schema';

// Wiki Categories
export const wikiCategories = pgTable(
  'wiki_categories',
  {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 255 }).notNull().unique(),
    description: text('description'),
    icon: varchar('icon', { length: 50 }), // lucide-react icon name
    displayOrder: integer('display_order').default(0),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    displayOrderIdx: index('wiki_categories_display_order_idx').on(table.displayOrder),
  })
);

// Wiki Pages
export const wikiPages = pgTable(
  'wiki_pages',
  {
    id: serial('id').primaryKey(),
    title: varchar('title', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull().unique(),
    content: text('content').notNull(), // markdown content
    categoryId: integer('category_id').references(() => wikiCategories.id),
    authorId: integer('author_id').references(() => users.id),
    version: integer('version').default(1),
    isPublished: boolean('is_published').default(false),
    views: integer('views').default(0),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    slugIdx: index('wiki_pages_slug_idx').on(table.slug),
    categoryIdx: index('wiki_pages_category_idx').on(table.categoryId),
    authorIdx: index('wiki_pages_author_idx').on(table.authorId),
    publishedIdx: index('wiki_pages_published_idx').on(table.isPublished),
  })
);

// Wiki Revisions (Version History)
export const wikiRevisions = pgTable(
  'wiki_revisions',
  {
    id: serial('id').primaryKey(),
    pageId: integer('page_id').notNull().references(() => wikiPages.id, { onDelete: 'cascade' }),
    content: text('content').notNull(), // markdown content at this revision
    authorId: integer('author_id').references(() => users.id),
    reason: varchar('reason', { length: 500 }), // why this revision was made
    revisionNumber: integer('revision_number').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    pageIdx: index('wiki_revisions_page_idx').on(table.pageId),
    authorIdx: index('wiki_revisions_author_idx').on(table.authorId),
    revisionIdx: index('wiki_revisions_number_idx').on(table.revisionNumber),
  })
);

// Wiki Attachments (Images, PDFs, etc.)
export const wikiAttachments = pgTable(
  'wiki_attachments',
  {
    id: serial('id').primaryKey(),
    pageId: integer('page_id').notNull().references(() => wikiPages.id, { onDelete: 'cascade' }),
    filename: varchar('filename', { length: 255 }).notNull(),
    url: varchar('url', { length: 500 }).notNull(), // S3 URL or similar
    type: varchar('type', { length: 50 }), // image, pdf, document, etc.
    size: integer('size'), // file size in bytes
    uploadedBy: integer('uploaded_by').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow(),
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
