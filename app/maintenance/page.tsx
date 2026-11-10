import type { Metadata } from "next";
import { connection } from "next/server";

export const metadata: Metadata = {
  title: "Maintenance",
  robots: { index: false, follow: false },
};

export default async function MaintenancePage() {
  await connection();

  const title = process.env.MAINTENANCE_TITLE?.trim() || "We'll be back soon";
  const message =
    process.env.MAINTENANCE_MESSAGE?.trim() ||
    "Warframe Market Dashboard is temporarily unavailable while we perform maintenance. Please check back soon.";

  return (
    <main className="flex min-h-[calc(100svh-2px)] items-center justify-center px-6 py-16">
      <div className="w-full max-w-xl">
        <h1 className="break-words text-balance font-heading text-4xl font-semibold tracking-tight sm:text-5xl">
          {title}
        </h1>
        <p className="mt-6 whitespace-pre-line break-words text-lg leading-relaxed text-muted-foreground">
          {message}
        </p>
      </div>
    </main>
  );
}
