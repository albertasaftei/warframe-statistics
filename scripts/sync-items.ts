import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../lib/db/schema";

const ITEMS_API = "https://api.warframe.market/v2/items";
const RELEVANT_TAGS = new Set(["set", "prime", "mod", "arcane_enhancement"]);

interface ApiItem {
  id: string;
  slug: string;
  tags: string[];
  maxRank?: number;
  ducats?: number;
  i18n: {
    en: {
      name: string;
      thumb?: string;
      icon?: string;
    };
  };
}

interface ApiResponse {
  data: ApiItem[];
}

function hasRelevantTag(tags: string[]): boolean {
  return tags.some((tag) => RELEVANT_TAGS.has(tag));
}

async function main() {
  const postgresUrl = process.env.POSTGRES_URL;
  if (!postgresUrl) {
    console.error("POSTGRES_URL environment variable is required");
    process.exit(1);
  }

  const sql = neon(postgresUrl);
  const db = drizzle(sql, { schema });

  console.log("Fetching items from warframe.market API...");
  const response = await fetch(ITEMS_API);
  if (!response.ok) {
    console.error(
      `API request failed: ${response.status} ${response.statusText}`,
    );
    process.exit(1);
  }

  const json: ApiResponse = await response.json();
  const allItems = json.data;
  console.log(`Total items from API: ${allItems.length}`);

  const relevantItems = allItems.filter((item) => hasRelevantTag(item.tags));
  console.log(`Items with relevant tags: ${relevantItems.length}`);

  let upsertedCount = 0;
  const batchSize = 50;

  for (let i = 0; i < relevantItems.length; i += batchSize) {
    const batch = relevantItems.slice(i, i + batchSize);
    const values = batch.map((item) => ({
      id: item.id,
      slug: item.slug,
      name: item.i18n.en.name,
      thumb: item.i18n.en.icon ?? null,
      tags: item.tags,
      maxRank: item.maxRank ?? null,
      ducats: item.ducats ?? null,
      syncedAt: new Date(),
    }));

    await db
      .insert(schema.items)
      .values(values)
      .onConflictDoUpdate({
        target: schema.items.id,
        set: {
          slug: schema.items.slug,
          name: schema.items.name,
          thumb: schema.items.thumb,
          tags: schema.items.tags,
          maxRank: schema.items.maxRank,
          ducats: schema.items.ducats,
          syncedAt: new Date(),
        },
      });

    upsertedCount += batch.length;
    console.log(`Upserted ${upsertedCount}/${relevantItems.length} items`);
  }

  console.log(`\nSync complete. ${upsertedCount} items upserted.`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
