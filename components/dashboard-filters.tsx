"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Search, ChevronDown, Check, X } from "lucide-react";

interface DashboardFiltersProps {
  availableTags: string[];
}

export function DashboardFilters({ availableTags }: DashboardFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [minPrice, setMinPrice] = useState(searchParams.get("minPrice") ?? "");
  const [maxPrice, setMaxPrice] = useState(searchParams.get("maxPrice") ?? "");
  const [open, setOpen] = useState(false);
  const selectedTags = searchParams.getAll("tags");

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const updateParams = useCallback(
    (updates: Record<string, string | string[] | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("page");

      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") {
          params.delete(key);
        } else if (Array.isArray(value)) {
          params.delete(key);
          value.forEach((v) => params.append(key, v));
        } else {
          params.set(key, value);
        }
      }

      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      });
    },
    [pathname, router, searchParams, startTransition],
  );

  const debouncedUpdate = useCallback(
    (updates: Record<string, string | null>) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => updateParams(updates), 300);
    },
    [updateParams],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function toggleTag(tag: string) {
    const newTags = selectedTags.includes(tag)
      ? selectedTags.filter((t) => t !== tag)
      : [...selectedTags, tag];
    updateParams({ tags: newTags.length > 0 ? newTags : null });
  }

  function clearTags() {
    updateParams({ tags: null });
  }

  const triggerLabel =
    selectedTags.length === 0
      ? "All categories"
      : selectedTags.length === 1
        ? selectedTags[0].replace(/_/g, " ")
        : `${selectedTags.length} selected`;

  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search items..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            debouncedUpdate({ search: e.target.value || null });
          }}
          className="pl-9 h-10 text-[15px]"
        />
      </div>

      <div className="flex gap-2">
        <Input
          type="number"
          placeholder="Min price"
          value={minPrice}
          onChange={(e) => {
            setMinPrice(e.target.value);
            debouncedUpdate({ minPrice: e.target.value || null });
          }}
          className="w-28 h-10 text-[15px]"
        />
        <Input
          type="number"
          placeholder="Max price"
          value={maxPrice}
          onChange={(e) => {
            setMaxPrice(e.target.value);
            debouncedUpdate({ maxPrice: e.target.value || null });
          }}
          className="w-28 h-10 text-[15px]"
        />
      </div>

      {availableTags.length > 0 && (
        <div className="flex items-center gap-1.5">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
              className={`flex h-10 items-center gap-2 rounded-md border px-3 text-[15px] transition-colors min-w-[160px] ${
                selectedTags.length > 0
                  ? "border-[#c8973e]/60 text-foreground"
                  : "border-input text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="flex-1 text-left truncate">{triggerLabel}</span>
              {selectedTags.length > 0 && (
                <Badge
                  variant="secondary"
                  className="h-5 px-1.5 text-xs font-mono rounded-sm"
                >
                  {selectedTags.length}
                </Badge>
              )}
              <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
            </PopoverTrigger>
            <PopoverContent className="w-56 p-0" align="end">
              <Command>
                <CommandInput
                  placeholder="Search categories..."
                  className="text-[14px]"
                />
                <CommandList>
                  <CommandEmpty>No categories found.</CommandEmpty>
                  <CommandGroup>
                    {availableTags.map((tag) => (
                      <CommandItem
                        key={tag}
                        value={tag}
                        onSelect={() => toggleTag(tag)}
                        className="text-[14px] cursor-pointer"
                      >
                        <Check
                          className={`mr-2 h-4 w-4 shrink-0 ${
                            selectedTags.includes(tag)
                              ? "opacity-100 text-[#c8973e]"
                              : "opacity-0"
                          }`}
                        />
                        {tag.replace(/_/g, " ")}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {selectedTags.length > 0 && (
            <button
              onClick={clearTags}
              className="flex h-10 w-10 items-center justify-center rounded-md border border-input text-muted-foreground hover:text-foreground transition-colors shrink-0"
              title="Clear filters"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
