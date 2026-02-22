import type { Metadata } from "next";
import { Sora, IBM_Plex_Mono } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora"
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-ibm-plex-mono"
});

export const metadata: Metadata = {
  metadataBase: new URL("https://grape-access.vercel.app"),
  title: "Grape Access Console",
  description:
    "Grape Access with verification and OG reputation gating on Solana.",
  icons: {
    icon: "/images/favicon.ico",
    shortcut: "/images/favicon.ico",
    apple: "/images/grapelogo512.png"
  },
  openGraph: {
    title: "Grape Access Console",
    description:
      "Manage access gates, verify eligibility, and share gate links with your community on Solana.",
    url: "/",
    siteName: "Grape Access Console",
    images: [
      {
        url: "/images/grapelogo512.png",
        width: 512,
        height: 512,
        alt: "Grape Access"
      }
    ],
    locale: "en_US",
    type: "website"
  },
  twitter: {
    card: "summary",
    title: "Grape Access Console",
    description:
      "Manage access gates, verify eligibility, and share gate links with your community on Solana.",
    images: ["/images/grapelogo512.png"]
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${sora.variable} ${ibmPlexMono.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
