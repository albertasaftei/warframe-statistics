import type { Metadata } from "next";
import { Geist_Mono, Space_Grotesk } from "next/font/google";
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
  title: "Warframe Market Dashboard",
  description: "Track top traded items and price trends from Warframe Market",
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
      </body>
    </html>
  );
}
