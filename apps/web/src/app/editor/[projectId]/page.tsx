"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  computeAutolayout,
  type LayoutSettings,
  type Placement,
} from "@/lib/autolayout";
import { type Orientation, type PaperSize } from "@/lib/constants";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const EditorCanvas = dynamic(() => import("@/components/EditorCanvas"), {
  ssr: false,
});

type Asset = {
  id: string;
  original_filename: string;
  width: number;
  height: number;
  file_url: string;
};

const DEFAULT_SETTINGS: LayoutSettings = {
  paper: "Letter",
  orientation: "portrait",
  margins: { top: 0.5, right: 0.5, bottom: 0.5, left: 0.5 },
  targetPages: 1,
};

export default function EditorPage({
  params,
}: {
  params: { projectId: string };
}) {
  const projectId = params.projectId;
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<LayoutSettings>(DEFAULT_SETTINGS);
  const [placements, setPlacements] = useState<Record<number, Placement[]>>({});
  const [pageIndex, setPageIndex] = useState(0);

  const fetchProject = useCallback(async () => {
    const res = await fetch(`${API_URL}/projects/${projectId}`);
    if (!res.ok) throw new Error("Failed to fetch project");
    const data = await res.json();
    setAssets(data.assets || []);
  }, [projectId]);

  useEffect(() => {
    fetchProject()
      .then(() => setLoading(false))
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to load");
        setLoading(false);
      });
  }, [fetchProject]);

  const applyAutolayout = useCallback(() => {
    const next = computeAutolayout(
      assets.map((a) => ({ id: a.id, width: a.width, height: a.height })),
      settings
    );
    setPlacements(next);
    setPageIndex(0);
  }, [assets, settings]);

  useEffect(() => {
    if (assets.length > 0 && Object.keys(placements).length === 0) {
      applyAutolayout();
    }
  }, [assets, placements, applyAutolayout]);

  const handlePlacementsChange = useCallback(
    (pageIdx: number, next: Placement[]) => {
      setPlacements((prev) => ({ ...prev, [pageIdx]: next }));
    },
    []
  );

  const totalPages = Math.max(
    1,
    Object.keys(placements).length ||
      Math.ceil(assets.length / Math.max(1, settings.targetPages))
  );

  if (loading) {
    return (
      <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
        <p>Loading…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
        <p style={{ color: "#c00" }}>{error}</p>
        <Link href="/new">Back to upload</Link>
      </main>
    );
  }

  if (assets.length === 0) {
    return (
      <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
        <p>No images in this project.</p>
        <Link href={`/new`}>Upload images</Link>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 16 }}>
        <Link href="/" style={{ color: "#06c" }}>← Home</Link>
        <h1 style={{ margin: 0 }}>Editor</h1>
      </div>

      {/* Settings */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          marginBottom: 24,
          padding: 16,
          background: "#f9f9f9",
          borderRadius: 4,
        }}
      >
        <label>
          Paper:{" "}
          <select
            value={settings.paper}
            onChange={(e) =>
              setSettings((s) => ({ ...s, paper: e.target.value as PaperSize }))
            }
          >
            <option value="Letter">Letter</option>
            <option value="A4">A4</option>
          </select>
        </label>
        <label>
          Orientation:{" "}
          <select
            value={settings.orientation}
            onChange={(e) =>
              setSettings((s) => ({
                ...s,
                orientation: e.target.value as Orientation,
              }))
            }
          >
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </select>
        </label>
        <label>
          Margins (in) T/R/B/L:{" "}
          <input
            type="number"
            min={0}
            step={0.1}
            value={settings.margins.top}
            onChange={(e) =>
              setSettings((s) => ({
                ...s,
                margins: { ...s.margins, top: parseFloat(e.target.value) || 0 },
              }))
            }
            style={{ width: 40 }}
            title="Top"
          />
          <input
            type="number"
            min={0}
            step={0.1}
            value={settings.margins.right}
            onChange={(e) =>
              setSettings((s) => ({
                ...s,
                margins: { ...s.margins, right: parseFloat(e.target.value) || 0 },
              }))
            }
            style={{ width: 40 }}
            title="Right"
          />
          <input
            type="number"
            min={0}
            step={0.1}
            value={settings.margins.bottom}
            onChange={(e) =>
              setSettings((s) => ({
                ...s,
                margins: { ...s.margins, bottom: parseFloat(e.target.value) || 0 },
              }))
            }
            style={{ width: 40 }}
            title="Bottom"
          />
          <input
            type="number"
            min={0}
            step={0.1}
            value={settings.margins.left}
            onChange={(e) =>
              setSettings((s) => ({
                ...s,
                margins: { ...s.margins, left: parseFloat(e.target.value) || 0 },
              }))
            }
            style={{ width: 40 }}
            title="Left"
          />
        </label>
        <label>
          Target pages:{" "}
          <input
            type="number"
            min={1}
            value={settings.targetPages}
            onChange={(e) =>
              setSettings((s) => ({
                ...s,
                targetPages: Math.max(1, parseInt(e.target.value, 10) || 1),
              }))
            }
            style={{ width: 48 }}
          />
        </label>
        <button
          onClick={applyAutolayout}
          style={{
            padding: "6px 12px",
            background: "#06c",
            color: "white",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          Reset layout
        </button>
      </div>

      {/* Page nav + Canvas */}
      <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
          disabled={pageIndex === 0}
          style={{
            padding: "6px 12px",
            background: pageIndex === 0 ? "#ccc" : "#06c",
            color: "white",
            border: "none",
            borderRadius: 4,
            cursor: pageIndex === 0 ? "not-allowed" : "pointer",
          }}
        >
          ← Prev
        </button>
        <span>
          Page {pageIndex + 1} / {totalPages}
        </span>
        <button
          onClick={() => setPageIndex((p) => Math.min(totalPages - 1, p + 1))}
          disabled={pageIndex >= totalPages - 1}
          style={{
            padding: "6px 12px",
            background: pageIndex >= totalPages - 1 ? "#ccc" : "#06c",
            color: "white",
            border: "none",
            borderRadius: 4,
            cursor: pageIndex >= totalPages - 1 ? "not-allowed" : "pointer",
          }}
        >
          Next →
        </button>
      </div>

      <EditorCanvas
        assets={assets}
        placements={placements}
        pageIndex={pageIndex}
        paper={settings.paper}
        orientation={settings.orientation}
        margins={settings.margins}
        onPlacementsChange={handlePlacementsChange}
      />
    </main>
  );
}
