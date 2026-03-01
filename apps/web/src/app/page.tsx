import Link from "next/link";

export default function Home() {
  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: 24 }}>
      <h1>Cheat Sheet Maker</h1>
      <p>Upload images, lay them out, export PDF.</p>
      <Link
        href="/new"
        style={{
          display: "inline-block",
          marginTop: 16,
          padding: "10px 20px",
          background: "#06c",
          color: "white",
          borderRadius: 4,
          textDecoration: "none",
        }}
      >
        Create New Cheat Sheet
      </Link>
    </main>
  );
}
