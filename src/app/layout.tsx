import type { Metadata } from "next";
import { Inter, Barlow_Condensed } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const inter = Inter({ variable: "--font-sans", subsets: ["latin"] });
const barlow = Barlow_Condensed({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: { default: "PullScope — Arm-wrestling match analysis", template: "%s · PullScope" },
  description:
    "Score arm-wrestling matches on a technique rubric with frame-accurate, timestamped evidence. Export shareable report cards.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${barlow.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
