"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LINKS } from "../lib/content";
import SantraIcon from "./Logo";

const NAV_LINKS = [
  { label: "Docs",      href: LINKS.docs },
  { label: "Install",   href: LINKS.install },
  { label: "Providers", href: LINKS.providers },
];

export default function Nav() {
  const path = usePathname();

  return (
    <header className="nav-wrap">
      <div
        className="container"
        style={{ display: "flex", alignItems: "center", height: 56, gap: "2rem" }}
      >
        {/* Logo */}
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            textDecoration: "none",
            flexShrink: 0,
          }}
        >
          <SantraIcon size={26} />
          <span
            style={{
              fontFamily: "var(--mono)",
              fontWeight: 700,
              fontSize: "0.9rem",
              color: "var(--orange)",
              letterSpacing: "-0.01em",
            }}
          >
            santra
          </span>
        </Link>

        {/* Links */}
        <nav
          style={{ display: "flex", alignItems: "center", gap: "0.1rem", flex: 1 }}
          className="hide-mobile"
        >
          {NAV_LINKS.map(({ label, href }) => {
            const active = path === href || path.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                style={{
                  fontSize: "0.85rem",
                  fontWeight: 500,
                  color: active ? "var(--text)" : "var(--text-2)",
                  textDecoration: "none",
                  padding: "0.35rem 0.65rem",
                  borderRadius: 4,
                  transition: "color 0.12s",
                }}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        {/* CTAs */}
        <div style={{ display: "flex", alignItems: "center", marginLeft: "auto" }}>
          <a
            href={LINKS.github}
            target="_blank"
            rel="noopener noreferrer"
            className="hide-mobile"
            style={{
              fontSize: "0.82rem",
              color: "var(--text-2)",
              textDecoration: "none",
              fontFamily: "var(--mono)",
              transition: "color 0.12s",
            }}
          >
            GitHub ↗
          </a>
        </div>
      </div>
    </header>
  );
}
