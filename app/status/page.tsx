import type { Metadata } from "next";
import { Suspense } from "react";
import PublicStatusPage from "./public-status-page";

export const metadata: Metadata = {
  title: "Public access status | Grape Access",
  description: "View a wallet’s dated on-chain access-check record. No wallet connection required.",
  openGraph: { title: "Public access status | Grape Access", description: "Open to read this wallet’s access-check record from Solana. A recorded result is not a guarantee of current eligibility." },
  twitter: { card: "summary", title: "Public access status | Grape Access", description: "View a dated on-chain access-check record." },
  robots: { index: false, follow: false }
};
export default function Page() {
  return <Suspense fallback={<p>Loading public access status…</p>}><PublicStatusPage /></Suspense>;
}
