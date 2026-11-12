import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { lt, sql } from "drizzle-orm";
import * as schema from "../lib/db/schema";

const HISTORY_BASE = "https://relics.run/history";
const DAYS_TO_KEEP = 7;
const DOWNLOAD_TIMEOUT_MS = 30_000;
const WRITE_BATCH_SIZE = 500;

interface StatEntry {
  datetime: string;
  volume: number;
  min_price: number;
  max_price: number;
  avg_price: number;
  wa_price: number;
  median: number;
  moving_avg?: number | null;
  item_id: string;
  mod_rank?: number | null;
}

interface AggregatedStat {
  date: string;
  modRank: number;
  volume: number;
  minPrice: number;
  maxPrice: number;
  avgPrice: number;
  waPrice: number;
  median: number;
  movingAvg: number | null;
}

function aggregateByRank(entries: StatEntry[], date: string): AggregatedStat[] {
  // If any entry has a mod_rank, this is a ranked item.
  // Filter out rank-less entries for ranked items — those are summary/legacy rows.
  const hasRanks = entries.some((e) => e.mod_rank != null);
  const working = hasRanks ? entries.filter((e) => e.mod_rank != null) : entries;

  // Entries are already scoped to one item and UTC date.
  const groups = new Map<number, StatEntry[]>();

  for (const entry of working) {
    const rank = entry.mod_rank ?? -1;
    const existing = groups.get(rank) ?? [];
    existing.push(entry);
    groups.set(rank, existing);
  }

  const aggregated: AggregatedStat[] = [];

  for (const [modRank, groupEntries] of groups) {
    const totalVolume = groupEntries.reduce((sum, e) => sum + e.volume, 0);
    if (totalVolume === 0) continue;

    let weightedWaPrice = 0;
    let weightedMedian = 0;
    let weightedAvgPrice = 0;
    let weightedMovingAvg = 0;
    let movingAvgVolume = 0;

    for (const e of groupEntries) {
      const weight = e.volume / totalVolume;
      weightedWaPrice += e.wa_price * weight;
      weightedMedian += e.median * weight;
      weightedAvgPrice += e.avg_price * weight;
      if (e.moving_avg != null) {
        weightedMovingAvg += e.moving_avg * e.volume;
        movingAvgVolume += e.volume;
      }
    }

    aggregated.push({
      date,
      modRank,
      volume: totalVolume,
      minPrice: Math.min(...groupEntries.map((e) => e.min_price)),
      maxPrice: Math.max(...groupEntries.map((e) => e.max_price)),
      avgPrice: Math.round(weightedAvgPrice * 1000) / 1000,
      waPrice: Math.round(weightedWaPrice * 1000) / 1000,
      median: Math.round(weightedMedian * 1000) / 1000,
      movingAvg: movingAvgVolume > 0
        ? Math.round((weightedMovingAvg / movingAvgVolume) * 1000) / 1000
        : null,
    });
  }

  return aggregated;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isClosedStat(row: Record<string, unknown>): row is Record<string, unknown> & StatEntry {
  return typeof row.item_id === "string" && row.item_id.length > 0 &&
    isFiniteNumber(row.volume) && Number.isInteger(row.volume) && row.volume >= 0 &&
    isFiniteNumber(row.min_price) && isFiniteNumber(row.max_price) &&
    isFiniteNumber(row.avg_price) && isFiniteNumber(row.wa_price) &&
    isFiniteNumber(row.median) &&
    (row.moving_avg == null || isFiniteNumber(row.moving_avg)) &&
    (row.mod_rank == null ||
      (isFiniteNumber(row.mod_rank) && Number.isInteger(row.mod_rank) && row.mod_rank >= 0));
}

function parseHistory(data: unknown, date: string): Map<string, StatEntry[]> {
  if (!isObject(data) || Object.keys(data).length === 0) {
    throw new Error("Expected a non-empty object of item histories");
  }

  const byItem = new Map<string, StatEntry[]>();
  for (const [name, records] of Object.entries(data)) {
    if (!Array.isArray(records)) throw new Error(`Invalid history for ${name}`);

    for (const row of records) {
      if (!isObject(row) || typeof row.datetime !== "string") {
        throw new Error(`Invalid history record for ${name}`);
      }
      const timestamp = Date.parse(row.datetime);
      if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date) {
        throw new Error(`Unexpected timestamp for ${name}: ${row.datetime}`);
      }
      if (row.order_type === "buy" || row.order_type === "sell") continue;
      if (row.order_type !== "closed" || !isClosedStat(row)) {
        throw new Error(`Invalid trade record for ${name}`);
      }

      const entries = byItem.get(row.item_id) ?? [];
      entries.push(row);
      byItem.set(row.item_id, entries);
    }
  }
  return byItem;
}

async function main() {
  const postgresUrl = "postgresql://neondb_owner:npg_1yYCaxPLZDq6@ep-fancy-cherry-asajv3yr-pooler.c-4.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
  if (!postgresUrl) throw new Error("POSTGRES_URL environment variable is required");

  const db = drizzle(neon(postgresUrl), { schema });
  const catalog = await db.select({ id: schema.items.id }).from(schema.items);
  if (catalog.length === 0) throw new Error("No items found. Run sync-items first.");
  const itemIds = new Set(catalog.map(({ id }) => id));

  const today = new Date();
  const dates = Array.from({ length: DAYS_TO_KEEP }, (_, index) =>
    new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - index - 1))
      .toISOString().slice(0, 10),
  );

  let failed = 0;
  let pending = false;
  for (const [index, date] of dates.entries()) {
    try {
      const url = `${HISTORY_BASE}/price_history_${date}.json`;
      const response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
      if (index === 0 && response.status === 404) {
        console.log(`${date}: pending publication (HTTP 404). The next scheduled run will retry.`);
        pending = true;
        continue;
      }
      if (!response.ok) throw new Error(`GET ${url} returned HTTP ${response.status}`);

      const byItem = parseHistory(await response.json(), date);
      const rows: schema.NewDailyStat[] = [];
      const unmatchedIds: string[] = [];
      for (const [itemId, entries] of byItem) {
        if (!itemIds.has(itemId)) {
          unmatchedIds.push(itemId);
          continue;
        }

        for (const stat of aggregateByRank(entries, date)) {
          rows.push({
            itemId,
            date,
            modRank: stat.modRank,
            volume: stat.volume,
            minPrice: stat.minPrice.toString(),
            maxPrice: stat.maxPrice.toString(),
            avgPrice: stat.avgPrice.toString(),
            waPrice: stat.waPrice.toString(),
            median: stat.median.toString(),
            movingAvg: stat.movingAvg?.toString() ?? null,
          });
        }
      }

      const writes = [];
      for (let offset = 0; offset < rows.length; offset += WRITE_BATCH_SIZE) {
        writes.push(db.insert(schema.dailyStats)
          .values(rows.slice(offset, offset + WRITE_BATCH_SIZE))
          .onConflictDoUpdate({
            target: [schema.dailyStats.itemId, schema.dailyStats.date, schema.dailyStats.modRank],
            set: {
              volume: sql`excluded.volume`,
              minPrice: sql`excluded.min_price`,
              maxPrice: sql`excluded.max_price`,
              avgPrice: sql`excluded.avg_price`,
              waPrice: sql`excluded.wa_price`,
              median: sql`excluded.median`,
              movingAvg: sql`excluded.moving_avg`,
            },
          }));
      }
      const [first, ...rest] = writes;
      if (first) await db.batch([first, ...rest]);
      if (unmatchedIds.length) {
        console.warn(`${date}: ${unmatchedIds.length} unmatched item IDs (first 10: ${unmatchedIds.slice(0, 10).join(", ")})`);
      }
      console.log(`${date}: imported ${rows.length} stat rows from ${byItem.size} items with closed trades`);
    } catch (error) {
      failed++;
      console.error(`${date}: import failed:`, error);
    }
  }

  if (!failed && !pending) {
    const cutoff = dates[dates.length - 1];
    await db.delete(schema.dailyStats).where(lt(schema.dailyStats.date, cutoff));
    console.log(`Pruned stat rows older than ${cutoff}`);
  }

  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error("Stats sync failed:", error);
  process.exitCode = 1;
});
