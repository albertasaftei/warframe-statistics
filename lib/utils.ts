import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const SLUG_STRIP_SUFFIXES = [
  '_neuroptics_blueprint',
  '_chassis_blueprint',
  '_systems_blueprint',
  '_systems',
  '_carapace',
  '_cerebrum',
  '_blueprint',
  '_set',
  '_(veiled)',
];

export function slugToWikiName(slug: string): string {
  let s = slug.toLowerCase();

  for (const suffix of SLUG_STRIP_SUFFIXES) {
    console.log(`Checking if "${s}" ends with "${suffix}"`);
    if (s.endsWith(suffix)) {
      s = s.slice(0, s.length - suffix.length);
      break;
    }
  }

  return s.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}
