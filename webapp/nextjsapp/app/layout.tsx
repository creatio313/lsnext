import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: "ライブ配信アプリ on さくらのクラウド",
  description:
    "さくらのクラウド上で動作する、ImageFlux Live Streamingでライブ配信を行うためのWebアプリケーション。",
  icons: {
    icon: "/normal(color).svg",
  },
  openGraph: {
    type: "website",
    title: "ライブ配信アプリ on さくらのクラウド",
    locale: "ja_JP",
    description:
      "さくらのクラウド上で動作する、ImageFlux Live Streamingでライブ配信を行うためのWebアプリケーション。",
    images: [{ url: "/OGP.jpg" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "ライブ配信アプリ on さくらのクラウド",
    description:
      "さくらのクラウド上で動作する、ImageFlux Live Streamingでライブ配信を行うためのWebアプリケーション。",
    images: ["/OGP.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
