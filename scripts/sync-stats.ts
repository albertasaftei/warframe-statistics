import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { lt, sql } from "drizzle-orm";
import * as schema from "../lib/db/schema";

const STATS_API_BASE = "https://api.warframe.market/v1/items";
const CONCURRENCY = 3;
const MIN_REQUEST_INTERVAL_MS = 400;
const MAX_RETRIES = 3;
const DAYS_TO_KEEP = 7;

let requestQueue: Promise<void> = Promise.resolve();
let lastRequestStartedAt = 0;

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

class ApiAccessDeniedError extends Error {}

function getDateString(datetime: string): string {
  return datetime.split("T")[0];
}

function getCutoffDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - DAYS_TO_KEEP);
  return d.toISOString().split("T")[0];
}

function aggregateByDateAndRank(entries: StatEntry[]): AggregatedStat[] {
  // If any entry has a mod_rank, this is a ranked item.
  // Filter out rank-less entries for ranked items — those are summary/legacy rows.
  const hasRanks = entries.some((e) => e.mod_rank != null);
  const working = hasRanks ? entries.filter((e) => e.mod_rank != null) : entries;

  // Group by (date, mod_rank) — use -1 as sentinel for items with no rank system
  const groups = new Map<string, StatEntry[]>();

  for (const entry of working) {
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
    await waitForRequestSlot();

    let response: Response;
    try {
      response = await fetch(url);
    } catch (error) {
      if (attempt === retries) throw error;

      console.warn(
        `Request failed, retrying in ${1000 * attempt}ms (attempt ${attempt}/${retries}): ${url}`,
      );
      await sleep(1000 * attempt);
      continue;
    }

    if (response.ok || (response.status !== 429 && response.status < 500)) {
      return response;
    }

    if (attempt === retries) return response;

    const backoff =
      response.status === 429
        ? getRateLimitBackoff(response, attempt)
        : 1000 * attempt;
    console.warn(
      `${response.status === 429 ? "Rate limited" : `Server error ${response.status}`}, backing off ${backoff}ms (attempt ${attempt}/${retries})`,
    );
    await sleep(backoff);
  }

  throw new Error(`Failed after ${retries} attempts: ${url}`);
}

async function waitForRequestSlot(): Promise<void> {
  const previous = requestQueue;
  let release!: () => void;
  requestQueue = new Promise((resolve) => {
    release = resolve;
  });

  await previous;
  const waitMs = Math.max(
    0,
    MIN_REQUEST_INTERVAL_MS - (Date.now() - lastRequestStartedAt),
  );
  if (waitMs > 0) await sleep(waitMs);

  lastRequestStartedAt = Date.now();
  release();
}

function getRateLimitBackoff(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);

    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) return Math.max(0, retryAt - Date.now());
  }

  return 5000 * attempt;
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
    const statsToWrite: (typeof schema.dailyStats.$inferInsert)[] = [];
    let accessDenied = false;

    const results = await Promise.allSettled(
      batch.map(async (item) => {
        const url = `${STATS_API_BASE}/${item.slug}/statistics`;
        const response = await fetchWithRetry(url);

        if (!response.ok) {
          const responseText = await response.text();
          const detail = responseText ? `: ${responseText.slice(0, 300)}` : "";
          const message = `Failed to fetch stats for ${item.slug}: ${response.status} ${response.statusText}${detail}`;

          if (response.status === 403) {
            throw new ApiAccessDeniedError(message);
          }
          throw new Error(message);
        }

        const json: StatsResponse = await response.json();
        const entries = json.payload?.statistics_closed?.["90days"] ?? [];

        const recentEntries = entries.filter(
          (e) => getDateString(e.datetime) >= cutoffDate,
        );

        if (recentEntries.length === 0) return [];

        const aggregated = aggregateByDateAndRank(recentEntries);

        return aggregated.map((stat) => ({
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
        }));
      }),
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        statsToWrite.push(...result.value);
      } else {
        errors++;
        console.error("Batch item error:", result.reason);
        if (result.reason instanceof ApiAccessDeniedError) {
          accessDenied = true;
        }
      }
    }

    if (statsToWrite.length > 0) {
      await db
        .insert(schema.dailyStats)
        .values(statsToWrite)
        .onConflictDoUpdate({
          target: [
            schema.dailyStats.itemId,
            schema.dailyStats.date,
            schema.dailyStats.modRank,
          ],
          set: {
            volume: sql`excluded.volume`,
            minPrice: sql`excluded.min_price`,
            maxPrice: sql`excluded.max_price`,
            avgPrice: sql`excluded.avg_price`,
            waPrice: sql`excluded.wa_price`,
            median: sql`excluded.median`,
            movingAvg: sql`excluded.moving_avg`,
          },
        });
      totalStatsWritten += statsToWrite.length;
    }

    processed += batch.length;
    if (processed % 50 === 0 || processed === allItems.length) {
      console.log(
        `Progress: ${processed}/${allItems.length} items | ${totalStatsWritten} stat rows written | ${errors} errors`,
      );
    }

    if (accessDenied) {
      console.error("Stopping sync after an API 403 response.");
      break;
    }
  }

  console.log(`\nSync complete:`);
  console.log(`  Items processed: ${processed}`);
  console.log(`  Stat rows written: ${totalStatsWritten}`);
  console.log(`  Errors: ${errors}`);

  if (errors > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
