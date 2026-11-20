import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getLocale } from "@/lib/session";

export const metadata: Metadata = {
  title: "Cups",
  description: "Cafe schedules, events, invoices and costs",
  icons: { icon: "/icon.svg", apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Cups", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#6e4524",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
