import { db } from "./db";
import { items, dailyStats } from "./db/schema";
import { sql, desc, asc, ilike, and, gte, lte, SQL } from "drizzle-orm";

export type SortColumn =
  | "name"
  | "waPrice"
  | "median"
  | "volume"
  | "totalValue";
export type SortDir = "asc" | "desc";

export interface GetTopItemsParams {
  page?: number;
  perPage?: number;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  tags?: string[];
  sortBy?: SortColumn;
  sortDir?: SortDir;
}

export interface DashboardItem {
  id: string;
  slug: string;
  name: string;
  thumb: string | null;
  tags: string[];
  modRank: number;
  volume: number;
  waPrice: number;
  median: number;
  totalValue: number;
  /** Display rank within the current filtered+paginated result set. */
  rank: number;
}

export interface GetTopItemsResult {
  items: DashboardItem[];
  totalCount: number;
  page: number;
  perPage: number;
  /** Maps "${id}-${modRank}" → medal position (1 | 2 | 3) for the unfiltered top-3 by current sort. */
  top3Keys: Record<string, 1 | 2 | 3>;
}

export async function getTopItems(
  params: GetTopItemsParams = {},
): Promise<GetTopItemsResult> {
  const {
    page = 1,
    perPage = 25,
    search,
    minPrice,
    maxPrice,
    tags,
    sortBy = "volume",
    sortDir = "desc",
  } = params;

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 7);
  const cutoff = cutoffDate.toISOString().split("T")[0];

  const volumeSum = sql<number>`COALESCE(SUM(${dailyStats.volume}), 0)`.as(
    "volume",
  );
  const waPriceAvg =
    sql<number>`COALESCE(AVG(${dailyStats.waPrice}::numeric), 0)`.as(
      "wa_price_avg",
    );
  const medianAvg =
    sql<number>`COALESCE(AVG(${dailyStats.median}::numeric), 0)`.as(
      "median_avg",
    );
  const totalValue =
    sql<number>`COALESCE(SUM(${dailyStats.volume} * ${dailyStats.waPrice}::numeric), 0)`.as(
      "total_value",
    );

  const conditions: SQL[] = [gte(dailyStats.date, cutoff)];

  if (search) {
    conditions.push(ilike(items.name, `%${search}%`));
  }

  if (minPrice != null) {
    conditions.push(sql`${dailyStats.waPrice}::numeric >= ${minPrice}`);
  }

  if (maxPrice != null) {
    conditions.push(sql`${dailyStats.waPrice}::numeric <= ${maxPrice}`);
  }

  if (tags && tags.length > 0) {
    conditions.push(
      sql`${items.tags}::jsonb ?| array[${sql.join(
        tags.map((t) => sql`${t}`),
        sql`, `,
      )}]`,
    );
  }

  const whereClause = and(...conditions);

  const sortMap: Record<SortColumn, SQL> = {
    name: sql`${items.name}`,
    waPrice: sql`AVG(${dailyStats.waPrice}::numeric)`,
    median: sql`AVG(${dailyStats.median}::numeric)`,
    volume: sql`COALESCE(SUM(${dailyStats.volume}), 0)`,
    totalValue: sql`COALESCE(SUM(${dailyStats.volume} * ${dailyStats.waPrice}::numeric), 0)`,
  };

  const orderExpr = sortMap[sortBy] ?? volumeSum;
  const orderDir = sortDir === "asc" ? asc(orderExpr) : desc(orderExpr);

  const offset = (page - 1) * perPage;

  // Top-3 uses only the date cutoff — no search/price/tag filters — so medals
  // always reflect the globally best items by the current sort metric.
  const top3Query = db
    .select({ id: items.id, modRank: dailyStats.modRank })
    .from(items)
    .innerJoin(dailyStats, sql`${items.id} = ${dailyStats.itemId}`)
    .where(gte(dailyStats.date, cutoff))
    .groupBy(items.id, dailyStats.modRank)
    .orderBy(orderDir)
    .limit(3);

  const countQuery = db
    .select({
      count: sql<number>`COUNT(DISTINCT (${items.id}, ${dailyStats.modRank}))`,
    })
    .from(items)
    .innerJoin(dailyStats, sql`${items.id} = ${dailyStats.itemId}`)
    .where(whereClause);

  const dataQuery = db
    .select({
      id: items.id,
      slug: items.slug,
      name: items.name,
      thumb: items.thumb,
      tags: items.tags,
      modRank: dailyStats.modRank,
      volume: volumeSum,
      waPrice: waPriceAvg,
      median: medianAvg,
      totalValue: totalValue,
    })
    .from(items)
    .innerJoin(dailyStats, sql`${items.id} = ${dailyStats.itemId}`)
    .where(whereClause)
    .groupBy(
      items.id,
      items.slug,
      items.name,
      items.thumb,
      items.tags,
      dailyStats.modRank,
    )
    .orderBy(orderDir)
    .limit(perPage)
    .offset(offset);

  const [countResult, dataResult, top3Result] = await Promise.all([countQuery, dataQuery, top3Query]);

  const top3Keys: Record<string, 1 | 2 | 3> = {};
  top3Result.forEach((row, i) => {
    top3Keys[`${row.id}-${row.modRank}`] = (i + 1) as 1 | 2 | 3;
  });

  return {
    items: dataResult.map((row, i) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      thumb: row.thumb,
      tags: row.tags as string[],
      modRank: row.modRank,
      volume: Number(row.volume),
      waPrice: Math.round(Number(row.waPrice) * 100) / 100,
      median: Math.round(Number(row.median) * 100) / 100,
      totalValue: Math.round(Number(row.totalValue)),
      rank: offset + i + 1,
    })),
    totalCount: Number(countResult[0]?.count ?? 0),
    page,
    perPage,
    top3Keys,
  };
}

export async function getAvailableTags(): Promise<string[]> {
  const result = await db
    .select({
      tag: sql<string>`DISTINCT jsonb_array_elements_text(${items.tags})`,
    })
    .from(items);

  return result
    .map((r) => r.tag)
    .filter(Boolean)
    .sort();
}

export async function getLastUpdated(): Promise<string | null> {
  const result = await db
    .select({
      maxDate: sql<string>`MAX(${dailyStats.date})`,
    })
    .from(dailyStats);

  return result[0]?.maxDate ?? null;
}
