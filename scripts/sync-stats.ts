import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { lt } from "drizzle-orm";
import * as schema from "../lib/db/schema";

const STATS_API_BASE = "https://api.warframe.market/v1/items";
const CONCURRENCY = 5;
const BATCH_DELAY_MS = 500;
const MAX_RETRIES = 3;
const DAYS_TO_KEEP = 7;

interface StatEntry {
  datetime: string;
  volume: number;
  min_price: number;
  max_price: number;
  avg_price: number;
  wa_price: number;
  median: number;
  moving_avg: number;
  mod_rank?: number;
}

interface StatsResponse {
  payload: {
    statistics_closed: {
      "90days": StatEntry[];
    };
  };
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
  movingAvg: number;
}

function getDateString(datetime: string): string {
  return datetime.split("T")[0];
}

function getCutoffDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - DAYS_TO_KEEP);
  return d.toISOString().split("T")[0];
}

function aggregateByDateAndRank(entries: StatEntry[]): AggregatedStat[] {
  // Group by (date, mod_rank) — use -1 as sentinel for items with no rank
  const groups = new Map<string, StatEntry[]>();

  for (const entry of entries) {
    const date = getDateString(entry.datetime);
    const rank = entry.mod_rank ?? -1;
    const key = `${date}|${rank}`;
    const existing = groups.get(key) ?? [];
    existing.push(entry);
    groups.set(key, existing);
  }

  const aggregated: AggregatedStat[] = [];

  for (const [, groupEntries] of groups) {
    const date = getDateString(groupEntries[0].datetime);
    const modRank = groupEntries[0].mod_rank ?? -1;
    const totalVolume = groupEntries.reduce((sum, e) => sum + e.volume, 0);
    if (totalVolume === 0) continue;

    let weightedWaPrice = 0;
    let weightedMedian = 0;
    let weightedAvgPrice = 0;
    let weightedMovingAvg = 0;

    for (const e of groupEntries) {
      const weight = e.volume / totalVolume;
      weightedWaPrice += e.wa_price * weight;
      weightedMedian += e.median * weight;
      weightedAvgPrice += e.avg_price * weight;
      weightedMovingAvg += e.moving_avg * weight;
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
      movingAvg: Math.round(weightedMovingAvg * 1000) / 1000,
    });
  }

  return aggregated;
}

async function fetchWithRetry(
  url: string,
  retries = MAX_RETRIES,
): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const response = await fetch(url);

    if (response.ok) return response;

    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get("retry-after") ?? "5");
      const backoff = retryAfter * 1000 * attempt;
      console.warn(
        `Rate limited, backing off ${backoff}ms (attempt ${attempt}/${retries})`,
      );
      await sleep(backoff);
      continue;
    }

    if (attempt === retries) return response;

    await sleep(1000 * attempt);
  }

  throw new Error(`Failed after ${retries} attempts: ${url}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const postgresUrl = process.env.POSTGRES_URL;
  if (!postgresUrl) {
    console.error("POSTGRES_URL environment variable is required");
    process.exit(1);
  }

  const neonClient = neon(postgresUrl);
  const db = drizzle(neonClient, { schema });

  console.log("Reading items from database...");
  const allItems = await db
    .select({ id: schema.items.id, slug: schema.items.slug })
    .from(schema.items);

  console.log(`Found ${allItems.length} items in database`);
  if (allItems.length === 0) {
    console.log("No items found. Run sync-items first.");
    process.exit(0);
  }

  const cutoffDate = getCutoffDate();
  console.log(
    `Fetching stats for the last ${DAYS_TO_KEEP} days (since ${cutoffDate})`,
  );

  // Delete rows older than the retention window to keep the table lean
  await db
    .delete(schema.dailyStats)
    .where(lt(schema.dailyStats.date, cutoffDate));
  console.log(`Deleted stale rows older than ${cutoffDate}`);

  let processed = 0;
  let totalStatsWritten = 0;
  let errors = 0;

  for (let i = 0; i < allItems.length; i += CONCURRENCY) {
    const batch = allItems.slice(i, i + CONCURRENCY);

    const results = await Promise.allSettled(
      batch.map(async (item) => {
        const url = `${STATS_API_BASE}/${item.slug}/statistics`;
        const response = await fetchWithRetry(url);

        if (!response.ok) {
          console.warn(
            `Failed to fetch stats for ${item.slug}: ${response.status}`,
          );
          return 0;
        }

        const json: StatsResponse = await response.json();
        const entries = json.payload?.statistics_closed?.["90days"] ?? [];

        const recentEntries = entries.filter(
          (e) => getDateString(e.datetime) >= cutoffDate,
        );

        if (recentEntries.length === 0) return 0;

        const aggregated = aggregateByDateAndRank(recentEntries);

        for (const stat of aggregated) {
          await db
            .insert(schema.dailyStats)
            .values({
              itemId: item.id,
              date: stat.date,
              modRank: stat.modRank,
              volume: stat.volume,
              minPrice: stat.minPrice.toString(),
              maxPrice: stat.maxPrice.toString(),
              avgPrice: stat.avgPrice.toString(),
              waPrice: stat.waPrice.toString(),
              median: stat.median.toString(),
              movingAvg: stat.movingAvg.toString(),
            })
            .onConflictDoUpdate({
              target: [
                schema.dailyStats.itemId,
                schema.dailyStats.date,
                schema.dailyStats.modRank,
              ],
              set: {
                volume: stat.volume,
                minPrice: stat.minPrice.toString(),
                maxPrice: stat.maxPrice.toString(),
                avgPrice: stat.avgPrice.toString(),
                waPrice: stat.waPrice.toString(),
                median: stat.median.toString(),
                movingAvg: stat.movingAvg.toString(),
              },
            });
        }

        return aggregated.length;
      }),
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        totalStatsWritten += result.value;
      } else {
        errors++;
        console.error("Batch item error:", result.reason);
      }
    }

    processed += batch.length;
    if (processed % 50 === 0 || processed === allItems.length) {
      console.log(
        `Progress: ${processed}/${allItems.length} items | ${totalStatsWritten} stat rows written | ${errors} errors`,
      );
    }

    if (i + CONCURRENCY < allItems.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  console.log(`\nSync complete:`);
  console.log(`  Items processed: ${processed}`);
  console.log(`  Stat rows written: ${totalStatsWritten}`);
  console.log(`  Errors: ${errors}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
