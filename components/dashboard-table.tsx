import Link from "next/link";
import Image from "next/image";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { DashboardItem, SortColumn, SortDir } from "@/lib/queries";

const ASSET_BASE = "https://warframe.market/static/assets/";

interface DashboardTableProps {
  items: DashboardItem[];
  sortBy: SortColumn;
  sortDir: SortDir;
  currentParams: Record<string, string | string[]>;
}

interface ColumnDef {
  key: SortColumn;
  label: string;
  align?: "left" | "right";
}

const columns: ColumnDef[] = [
  { key: "name", label: "Item", align: "left" },
  { key: "waPrice", label: "Avg Price", align: "right" },
  { key: "median", label: "Median", align: "right" },
  { key: "volume", label: "Volume (7d)", align: "right" },
  { key: "totalValue", label: "Total Value", align: "right" },
];

function buildSortHref(
  col: SortColumn,
  currentSort: SortColumn,
  currentDir: SortDir,
  currentParams: Record<string, string | string[]>,
): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(currentParams)) {
    if (key === "sortBy" || key === "sortDir") continue;
    if (Array.isArray(value)) {
      value.forEach((v) => params.append(key, v));
    } else {
      params.set(key, value);
    }
  }

  params.set("sortBy", col);
  if (col === currentSort) {
    params.set("sortDir", currentDir === "desc" ? "asc" : "desc");
  } else {
    params.set("sortDir", "desc");
  }

  return `?${params.toString()}`;
}

function SortIcon({
  column,
  sortBy,
  sortDir,
}: {
  column: SortColumn;
  sortBy: SortColumn;
  sortDir: SortDir;
}) {
  if (column !== sortBy)
    return <ArrowUpDown className="ml-1 h-3 w-3 opacity-40" />;
  return sortDir === "desc" ? (
    <ArrowDown className="ml-1 h-3 w-3" />
  ) : (
    <ArrowUp className="ml-1 h-3 w-3" />
  );
}

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function DashboardTable({
  items,
  sortBy,
  sortDir,
  currentParams,
}: DashboardTableProps) {
  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No items found. Try adjusting your filters.
      </div>
    );
  }

  return (
    <div className="rounded-lg border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12" />
            {columns.map((col) => (
              <TableHead
                key={col.key}
                className={col.align === "right" ? "text-right" : ""}
              >
                <Link
                  href={buildSortHref(col.key, sortBy, sortDir, currentParams)}
                  className="inline-flex items-center hover:text-foreground transition-colors"
                  scroll={false}
                >
                  {col.label}
                  <SortIcon
                    column={col.key}
                    sortBy={sortBy}
                    sortDir={sortDir}
                  />
                </Link>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="p-2">
                {item.thumb ? (
                  <Image
                    src={`${ASSET_BASE}${item.thumb}`}
                    alt={item.name}
                    width={48}
                    height={48}
                    className="rounded"
                    unoptimized
                  />
                ) : (
                  <div className="w-12 h-12 rounded bg-muted" />
                )}
              </TableCell>
              <TableCell className="font-medium">{item.name}</TableCell>
              <TableCell className="text-right tabular-nums">
                {item.waPrice.toFixed(1)}{" "}
                <span className="text-muted-foreground text-xs">p</span>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {item.median.toFixed(1)}{" "}
                <span className="text-muted-foreground text-xs">p</span>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatNumber(item.volume)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatNumber(item.totalValue)}{" "}
                <span className="text-muted-foreground text-xs">p</span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
