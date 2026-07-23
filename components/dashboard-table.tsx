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
  startRank: number;
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
  startRank,
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
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-10 text-right font-mono text-xs text-muted-foreground/40 pr-3">
              #
            </TableHead>
            <TableHead className="w-14" />
            {columns.map((col) => (
              <TableHead
                key={col.key}
                className={`${col.align === "right" ? "text-right" : ""} text-xs font-medium`}
              >
                <Link
                  href={buildSortHref(col.key, sortBy, sortDir, currentParams)}
                  className={`inline-flex items-center transition-colors ${
                    col.key === sortBy
                      ? "text-[#c8973e]"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
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
          {items.map((item, index) => {
            const rank = startRank + index;
            return (
              <TableRow key={item.id} className="hover:bg-muted/30">
                <TableCell className="text-right font-mono text-sm text-muted-foreground/40 pr-3 py-3">
                  {rank}
                </TableCell>
                <TableCell className="py-3 pl-3 pr-2 md:w-[100px]">
                  {item.thumb ? (
                    <Image
                      src={`${ASSET_BASE}${item.thumb}`}
                      alt={item.name}
                      width={128}
                      height={128}
                      className="rounded"
                      unoptimized
                    />
                  ) : (
                    <div className="w-16 h-16 rounded bg-muted" />
                  )}
                </TableCell>
                <TableCell className="font-medium py-3 text-[15px]">
                  <span>{item.name}</span>
                  {item.modRank >= 0 && (
                    <span className="ml-2 text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      R{item.modRank}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right py-3">
                  <span className="font-mono text-[15px]">
                    {item.waPrice.toFixed(1)}
                  </span>
                  <span className="text-[#c8973e] text-xs ml-0.5 opacity-70">
                    p
                  </span>
                </TableCell>
                <TableCell className="text-right py-3">
                  <span className="font-mono text-[15px]">
                    {item.median.toFixed(1)}
                  </span>
                  <span className="text-[#c8973e] text-xs ml-0.5 opacity-70">
                    p
                  </span>
                </TableCell>
                <TableCell className="text-right py-3">
                  <span className="font-mono text-[15px]">
                    {formatNumber(item.volume)}
                  </span>
                </TableCell>
                <TableCell className="text-right py-3">
                  <span className="font-mono text-[15px]">
                    {formatNumber(item.totalValue)}
                  </span>
                  <span className="text-[#c8973e] text-xs ml-0.5 opacity-70">
                    p
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
