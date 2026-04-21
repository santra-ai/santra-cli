import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CLI Login — Santra",
  description:
    "Start a session-specific Santra CLI login from the terminal.",
};

export default function LoginPage() {
  return (
    <section
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem 1.5rem",
      }}
    >
      <div className="container-sm" style={{ maxWidth: 560 }}>
        <p className="overline" style={{ marginBottom: "1rem" }}>
          Santra CLI
        </p>
        <h1 className="title" style={{ marginBottom: "1rem" }}>
          Open this from the CLI
        </h1>
        <p
          style={{
            color: "var(--text-2)",
            lineHeight: 1.7,
            maxWidth: 520,
          }}
        >
          Sign-in links are created per CLI session. Run <code>/login</code> in{" "}
          <code>santra-cli</code> or start the terminal app without a saved
          config to open a unique login URL automatically.
        </p>
      </div>
    </section>
  );
}
