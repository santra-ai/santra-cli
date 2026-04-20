import Link from "next/link";
import { LINKS } from "../lib/content";
import SantraIcon from "./Logo";

export default function Footer() {
  return (
    <footer style={{ borderTop: "1px solid var(--border)", padding: "2.5rem 1.5rem" }}>
      <div
        className="container"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <span style={{ color: "var(--text-3)", fontSize: "0.8rem", fontFamily: "var(--mono)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <SantraIcon size={16} />
          santra · MIT · built by{" "}
          <a
            href="https://vishalvoid.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--text-2)", textDecoration: "none" }}
          >
            Vishal
          </a>
        </span>
        <nav style={{ display: "flex", gap: "1.25rem" }}>
          {[
            { label: "Docs",      href: LINKS.docs,      external: false },
            { label: "Install",   href: LINKS.install,   external: false },
            { label: "Providers", href: LINKS.providers, external: false },
            { label: "GitHub",    href: LINKS.github,    external: true  },
            { label: "Discord",   href: LINKS.discord,   external: true  },
          ].map(({ label, href, external }) =>
            external ? (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: "0.8rem", color: "var(--text-3)", textDecoration: "none" }}
              >
                {label}
              </a>
            ) : (
              <Link
                key={label}
                href={href}
                style={{ fontSize: "0.8rem", color: "var(--text-3)", textDecoration: "none" }}
              >
                {label}
              </Link>
            )
          )}
        </nav>
      </div>
    </footer>
  );
}
