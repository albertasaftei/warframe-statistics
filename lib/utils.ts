import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const SLUG_STRIP_SUFFIXES = [
  "_neuroptics_blueprint",
  "_chassis_blueprint",
  "_systems_blueprint",
  "_systems",
  "_carapace",
  "_cerebrum",
  "_blueprint",
  "_set",
  "_(veiled)",
];

const GENERIC_IMAGE_NAMES: Record<string, string> = {
  _barrel: "GenericGunPrimeBarrel",
  _stock: "GenericGunPrimeStock",
  _receiver: "GenericGunPrimeReceiver",
  _blade: "GenericWeaponPrimeBlade",
  _handle: "GenericWeaponPrimeHilt",
  _hilt: "GenericWeaponPrimeHilt",
  _ornament: "GenericComponentPrimePlug",
};

export function slugToWikiName(slug: string): string {
  let s = slug.toLowerCase();

  for (const suffix of SLUG_STRIP_SUFFIXES) {
    if (s.endsWith(suffix)) {
      s = s.slice(0, s.length - suffix.length);
      break;
    }
  }

  return s
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function slugToWikiImageUrl(slug: string, isMod?: boolean): string {
  const matchingSuffix = Object.keys(GENERIC_IMAGE_NAMES).find((suffix) =>
    slug.toLowerCase().endsWith(suffix),
  );

  let fileName = matchingSuffix
    ? GENERIC_IMAGE_NAMES[matchingSuffix]
    : slugToWikiName(slug).replace(/[^a-zA-Z0-9]/g, "");

  if (isMod && !matchingSuffix) {
    fileName = fileName + "Mod";
  }
  return `https://wiki.warframe.com/images/thumb/${fileName}.png/128px-${fileName}.png`;
}
