'use client'

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
import { ArrowDown, ArrowUp, ArrowUpDown, BookOpen, ShoppingCart } from "lucide-react";
import type { DashboardItem, SortColumn, SortDir } from "@/lib/queries";
import { slugToWikiName } from "@/lib/utils";

interface DashboardTableProps {
  items: DashboardItem[];
  sortBy: SortColumn;
  sortDir: SortDir;
  currentParams: Record<string, string | string[]>;
  top3Keys: Record<string, 1 | 2 | 3>;
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

const MEDAL = {
  1: {
    bg: "linear-gradient(135deg, #FFE066 0%, #F59E0B 100%)",
    shadow: "0 0 12px rgba(255,215,0,0.55), 0 2px 4px rgba(0,0,0,0.4)",
    color: "#5a3a00",
    rowBg: "linear-gradient(90deg, rgba(255,215,0,0.09) 0%, rgba(255,215,0,0.03) 30%, transparent 60%)",
    border: "#FFD700",
    nameColor: "text-amber-300",
  },
  2: {
    bg: "linear-gradient(135deg, #F0F0F0 0%, #9CA3AF 100%)",
    shadow: "0 0 12px rgba(192,192,192,0.5), 0 2px 4px rgba(0,0,0,0.4)",
    color: "#1f2937",
    rowBg: "linear-gradient(90deg, rgba(192,192,192,0.08) 0%, rgba(192,192,192,0.02) 30%, transparent 60%)",
    border: "#C0C0C0",
    nameColor: "text-slate-300",
  },
  3: {
    bg: "linear-gradient(135deg, #E8A060 0%, #92400E 100%)",
    shadow: "0 0 12px rgba(205,127,50,0.5), 0 2px 4px rgba(0,0,0,0.4)",
    color: "#fff",
    rowBg: "linear-gradient(90deg, rgba(205,127,50,0.09) 0%, rgba(205,127,50,0.03) 30%, transparent 60%)",
    border: "#CD7F32",
    nameColor: "text-orange-300",
  },
} as const;

function MedalBadge({ rank }: { rank: number }) {
  const cfg = MEDAL[rank as keyof typeof MEDAL];
  if (!cfg) return <span className="text-muted-foreground/40 text-sm">{rank}</span>;
  return (
    <div
      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ml-auto select-none"
      style={{ background: cfg.bg, boxShadow: cfg.shadow, color: cfg.color }}
    >
      {rank}
    </div>
  );
}

export function DashboardTable({
  items,
  sortBy,
  sortDir,
  currentParams,
  top3Keys,
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
      <Table className="min-w-[640px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-10 text-right text-xs text-muted-foreground/40 pr-3">
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
            const medalRank = top3Keys[`${item.id}-${item.modRank}`];
            const medal = medalRank !== undefined ? MEDAL[medalRank] : null;
            const rowStyle = medal
              ? { background: medal.rowBg, borderLeft: `3px solid ${medal.border}` }
              : {};
            return (
              <TableRow
                key={`${item.id}-${item.modRank}-${index}`}
                className={`hover:bg-muted/30 ${
                  !medal && index % 2 === 1 ? "bg-muted/20" : ""
                }`}
                style={rowStyle}
              >
                <TableCell className="text-right text-sm pr-3 py-3">
                  {medal ? (
                    <MedalBadge rank={medalRank!} />
                  ) : (
                    <span className="text-muted-foreground/40">{item.rank}</span>
                  )}
                </TableCell>
                <TableCell className="py-3 pl-3 pr-2 min-w-[50px] md:w-[100px]">
                  {item.thumb ? (
                    <Image
                      src={`/api/assets/${item.thumb}`}
                      alt={item.name}
                      width={128}
                      height={128}
                      className="rounded"
                      unoptimized
                      loading={index < 8 ? "eager" : "lazy"}
                    />
                  ) : (
                    <div className="w-16 h-16 rounded bg-muted" />
                  )}
                </TableCell>
                <TableCell className="font-medium py-3 text-[15px]">
                  <div className="flex items-center gap-2">
                    <span className={medal?.nameColor ?? ""}>{item.name}</span>
                    {item.modRank >= 0 && (
                      <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        Rank {item.modRank}
                      </span>
                    )}
                    <a
                      href={`https://wiki.warframe.com/w/${slugToWikiName(item.slug)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1 text-muted-foreground hover:text-foreground transition-colors"
                      title="Open in Warframe Wiki"
                    >
                      <BookOpen className="h-3.5 w-3.5" />
                    </a>
                    <a
                      href={`https://warframe.market/items/${item.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      title="View on Warframe Market"
                    >
                      <ShoppingCart className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </TableCell>
                <TableCell className="text-right py-3">
                  <span className="font-bold text-[15px]">
                    {item.waPrice.toFixed(1)}
                  </span>
   
                </TableCell>
                <TableCell className="font-bold text-right py-3">
                  <span className="text-[15px]">
                    {item.median.toFixed(1)}
                  </span>

                </TableCell>
                <TableCell className="font-bold text-right py-3">
                  <span className="text-[15px]">
                    {formatNumber(item.volume)}
                  </span>
                </TableCell>
                <TableCell className="font-bold text-right py-3">
                  <span className="text-[15px]">
                    {formatNumber(item.totalValue)}
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
