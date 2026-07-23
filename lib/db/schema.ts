import {
  pgTable,
  text,
  integer,
  numeric,
  date,
  timestamp,
  serial,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const items = pgTable("items", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  thumb: text("thumb"),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  maxRank: integer("max_rank"),
  ducats: integer("ducats"),
  syncedAt: timestamp("synced_at").defaultNow().notNull(),
});

export const dailyStats = pgTable(
  "daily_stats",
  {
    id: serial("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    modRank: integer("mod_rank").notNull().default(-1),
    volume: integer("volume").notNull().default(0),
    minPrice: numeric("min_price"),
    maxPrice: numeric("max_price"),
    avgPrice: numeric("avg_price"),
    waPrice: numeric("wa_price"),
    median: numeric("median"),
    movingAvg: numeric("moving_avg"),
  },
  (table) => [
    uniqueIndex("daily_stats_item_date_rank_idx").on(
      table.itemId,
      table.date,
      table.modRank,
    ),
  ],
);

export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
export type DailyStat = typeof dailyStats.$inferSelect;
export type NewDailyStat = typeof dailyStats.$inferInsert;
