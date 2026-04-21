import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import SiteShell from "./components/SiteShell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Santra — repository-aware coding agent",
    template: "%s · Santra",
  },
  description:
    "A repository-aware coding agent for the terminal. Bring your own key, run any model, and delegate tasks across a swarm of specialised sub-agents.",
  keywords: ["coding agent", "CLI", "AI", "terminal", "Nvidia NIM", "OpenAI", "Anthropic", "bring your own key"],
  openGraph: {
    type: "website",
    siteName: "Santra",
    title: "Santra — repository-aware coding agent",
    description: "Bring your own key. Any model. Lives in your terminal.",
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          background: "var(--bg)",
          color: "var(--text)",
        }}
      >
        <SiteShell>{children}</SiteShell>
      </body>
    </html>
  );
}
