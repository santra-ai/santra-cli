"use client";

import { usePathname } from "next/navigation";
import Footer from "./Footer";
import Nav from "./Nav";

export default function SiteShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const hideMarketingChrome = pathname.startsWith("/login");

  return (
    <>
      {hideMarketingChrome ? null : <Nav />}
      <main style={{ flex: 1 }}>{children}</main>
      {hideMarketingChrome ? null : <Footer />}
    </>
  );
}
