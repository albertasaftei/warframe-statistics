import { Suspense } from "react";
import { getTopItems, getAvailableTags, getLastUpdated } from "@/lib/queries";
import type { SortColumn, SortDir } from "@/lib/queries";
import { DashboardFilters } from "@/components/dashboard-filters";
import { DashboardTable } from "@/components/dashboard-table";
import { PaginationControls } from "@/components/pagination-controls";

export const revalidate = 3600;

const validSortColumns: SortColumn[] = [
  "name",
  "waPrice",
  "median",
  "volume",
  "totalValue",
];
const validSortDirs: SortDir[] = ["asc", "desc"];

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function parseString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function parseNumber(v: string | string[] | undefined): number | undefined {
  const s = parseString(v);
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function parseTags(v: string | string[] | undefined): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

export default async function Home({ searchParams }: PageProps) {
  const params = await searchParams;

  const page = parseNumber(params.page) ?? 1;
  const search = parseString(params.search);
  const minPrice = parseNumber(params.minPrice);
  const maxPrice = parseNumber(params.maxPrice);
  const tags = parseTags(params.tags);
  const rawSort = parseString(params.sortBy);
  const rawDir = parseString(params.sortDir);
  const sortBy: SortColumn = validSortColumns.includes(rawSort as SortColumn)
    ? (rawSort as SortColumn)
    : "volume";
  const sortDir: SortDir = validSortDirs.includes(rawDir as SortDir)
    ? (rawDir as SortDir)
    : "desc";

  const [result, availableTags, lastUpdated] = await Promise.all([
    getTopItems({
      page,
      perPage: 25,
      search,
      minPrice,
      maxPrice,
      tags,
      sortBy,
      sortDir,
    }),
    getAvailableTags(),
    getLastUpdated(),
  ]);

  const currentParams: Record<string, string | string[]> = {};
  if (search) currentParams.search = search;
  if (minPrice != null) currentParams.minPrice = minPrice.toString();
  if (maxPrice != null) currentParams.maxPrice = maxPrice.toString();
  if (tags.length > 0) currentParams.tags = tags;
  if (page > 1) currentParams.page = page.toString();

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">
            Warframe Market Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Top traded items — last 7 days
            {lastUpdated && (
              <span className="ml-2 text-xs">· Updated {lastUpdated}</span>
            )}
          </p>
        </header>

        <Suspense>
          <section className="mb-6">
            <DashboardFilters availableTags={availableTags} />
          </section>
        </Suspense>

        <DashboardTable
          items={result.items}
          sortBy={sortBy}
          sortDir={sortDir}
          currentParams={currentParams}
        />

        <Suspense>
          <PaginationControls
            page={result.page}
            perPage={result.perPage}
            totalCount={result.totalCount}
          />
        </Suspense>
      </div>
    </div>
  );
}
