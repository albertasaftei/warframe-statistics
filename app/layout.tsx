import type { Metadata } from "next";
import { Geist_Mono, Space_Grotesk } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "Warframe Market Dashboard",
    template: "%s | Warframe Market Dashboard",
  },
  description:
    "Track Warframe Market item prices, trading volumes, and platinum price trends. Find the best items to trade and maximize your platinum earnings.",
  keywords: [
    "warframe market",
    "warframe prices",
    "warframe trading",
    "warframe platinum",
    "warframe item prices",
    "warframe market tracker",
    "warframe trading statistics",
    "warframe market trends",
    "warframe price history",
    "warframe trading guide",
    "warframe most sold items",
    "warframe most bought items",
    "warframe trading volume",
    "wf market",
  ],
  authors: [{ name: "Warframe Market Dashboard" }],
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    title: "Warframe Market Dashboard",
    description:
      "Track Warframe Market item prices, trading volumes, and platinum price trends. Find the best items to trade and maximize your platinum earnings.",
    siteName: "Warframe Market Dashboard",
  },
  twitter: {
    card: "summary_large_image",
    title: "Warframe Market Dashboard",
    description:
      "Track Warframe Market item prices, trading volumes, and platinum price trends.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistMono.variable} ${spaceGrotesk.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col">
        <div
          className="h-[2px] w-full flex-none"
          style={{ background: "#c8973e" }}
        />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
