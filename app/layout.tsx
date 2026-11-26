import "./globals.css";
import type { Metadata } from "next";
import { DataProvider } from "@/components/DataProvider";
import Shell from "@/components/Shell";

export const metadata: Metadata = { title: "Sponsor Growth Center", description: "Sponsorship cash command center with an embedded AI growth analyst" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><DataProvider><Shell>{children}</Shell></DataProvider></body>
    </html>
  );
}
