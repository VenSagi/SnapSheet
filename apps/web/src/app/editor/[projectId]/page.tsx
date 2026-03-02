"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { getErrorMessage } from "@/lib/api";
import {
  computeAutolayout,
  type LayoutSettings,
  type Placement,
} from "@/lib/autolayout";
import { type Orientation, type PaperSize } from "@/lib/constants";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const AUTOSAVE_DEBOUNCE_MS = 1000;

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
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [layoutRestored, setLayoutRestored] = useState(false);
  const skipNextLayoutEffectRef = useRef(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchProject = useCallback(async () => {
    const res = await fetch(`${API_URL}/projects/${projectId}`);
    if (!res.ok) {
      const msg = await getErrorMessage(res, "Failed to load project");
      throw new Error(msg);
    }
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

  const fetchLayout = useCallback(async () => {
    const res = await fetch(`${API_URL}/projects/${projectId}/layout`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.layout?.settings && data.layout?.placements ? data.layout : null;
  }, [projectId]);

  const saveLayout = useCallback(async () => {
    setSaveStatus("saving");
    try {
      const layout = {
        settings,
        placements: Object.fromEntries(
          Object.entries(placements).map(([k, v]) => [k, v])
        ),
      };
      const res = await fetch(`${API_URL}/projects/${projectId}/layout`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layout }),
      });
      if (!res.ok) {
        const msg = await getErrorMessage(res, "Save failed");
        throw new Error(msg);
      }
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("idle");
    }
  }, [projectId, settings, placements]);

  const applyAutolayout = useCallback(() => {
    const next = computeAutolayout(
      assets.map((a) => ({ id: a.id, width: a.width, height: a.height })),
      settings
    );
    setPlacements(next);
    setPageIndex(0);
  }, [assets, settings]);

  // Fetch and restore saved layout when assets load
  useEffect(() => {
    if (assets.length === 0 || layoutRestored) return;
    let cancelled = false;
    fetchLayout().then((saved) => {
      if (cancelled) return;
      if (saved) {
        const { settings: s, placements: p } = saved;
        if (s && s.paper && s.orientation && s.margins != null && s.targetPages != null) {
          setSettings({
            paper: s.paper,
            orientation: s.orientation,
            margins: s.margins,
            targetPages: s.targetPages,
          });
        }
        if (p && typeof p === "object") {
          const restored: Record<number, Placement[]> = {};
          for (const [k, v] of Object.entries(p)) {
            const idx = parseInt(k, 10);
            if (!isNaN(idx) && Array.isArray(v)) {
              restored[idx] = v.filter(
                (item: Placement) =>
                  item?.assetId && typeof item.x === "number" && typeof item.w === "number"
              );
            }
          }
          if (Object.keys(restored).length > 0) {
            skipNextLayoutEffectRef.current = true;
            setPlacements(restored);
          }
        }
      }
      setLayoutRestored(true);
    });
    return () => {
      cancelled = true;
    };
  }, [assets.length, layoutRestored, fetchLayout]);

  // Initial layout when assets load (no saved layout)
  useEffect(() => {
    if (assets.length > 0 && Object.keys(placements).length === 0 && layoutRestored) {
      applyAutolayout();
    }
  }, [assets, placements, applyAutolayout, layoutRestored]);

  // Re-layout when target pages, paper, orientation, or margins change (user-initiated)
  useEffect(() => {
    if (assets.length === 0) return;
    if (skipNextLayoutEffectRef.current) {
      skipNextLayoutEffectRef.current = false;
      return;
    }
    const next = computeAutolayout(
      assets.map((a) => ({ id: a.id, width: a.width, height: a.height })),
      settings
    );
    setPlacements(next);
    setPageIndex(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when layout-affecting settings change; settings/assets from closure are current
  }, [settings.targetPages, settings.paper, settings.orientation, settings.margins]);

  const handlePlacementsChange = useCallback(
    (pageIdx: number, next: Placement[]) => {
      setPlacements((prev) => ({ ...prev, [pageIdx]: next }));
    },
    []
  );

  // Autosave: debounce 1s after settings or placements change
  useEffect(() => {
    if (!layoutRestored || assets.length === 0) return;
    setSaveStatus("saving");
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      saveLayout();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [layoutRestored, assets.length, settings, placements, saveLayout]);

  const handleExport = useCallback(async () => {
    setExportError(null);
    setExporting(true);
    try {
      const pageCount = Math.max(1, Object.keys(placements).length);
      const exportPayload = {
        paper: settings.paper,
        orientation: settings.orientation,
        margins: settings.margins,
        page_count: pageCount,
        placements: Array.from({ length: pageCount }, (_, i) => ({
          items: (placements[i] || []).map((p) => ({
            assetId: p.assetId,
            x: p.x,
            y: p.y,
            w: p.w,
            h: p.h,
            ...(p.rotation != null && p.rotation !== 0 && { rotation: p.rotation }),
          })),
        })),
      };

      const res = await fetch(`${API_URL}/projects/${projectId}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(exportPayload),
      });

      if (!res.ok) {
        const msg = await getErrorMessage(res, `Export failed (${res.status})`);
        throw new Error(msg);
      }

      const { downloadUrl } = await res.json();
      window.open(downloadUrl, "_blank");
      setExportSuccess(true);
      setExportError(null);
      setTimeout(() => setExportSuccess(false), 4000);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Export failed");
      setExportSuccess(false);
    } finally {
      setExporting(false);
    }
  }, [projectId, placements, settings]);

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
      <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <Link href="/" style={{ color: "#06c" }}>← Home</Link>
        <h1 style={{ margin: 0 }}>Editor</h1>
        <span
          style={{
            fontSize: 13,
            color: saveStatus === "saving" ? "#666" : saveStatus === "saved" ? "#22c55e" : "#999",
          }}
        >
          {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved" : ""}
        </span>
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
        <button
          onClick={handleExport}
          disabled={exporting}
          style={{
            padding: "6px 12px",
            background: exporting ? "#999" : "#28a745",
            color: "white",
            border: "none",
            borderRadius: 4,
            cursor: exporting ? "not-allowed" : "pointer",
          }}
        >
          {exporting ? "Exporting…" : "Export PDF"}
        </button>
      </div>

      {exportError && (
        <div
          role="alert"
          style={{
            padding: 14,
            marginBottom: 16,
            background: "#fef2f2",
            border: "1px solid #dc2626",
            borderRadius: 6,
            color: "#991b1b",
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
          }}
        >
          <span style={{ flexShrink: 0 }} aria-hidden>⚠</span>
          <div>
            <strong>Export failed</strong>
            <p style={{ margin: "4px 0 0", fontSize: 14 }}>{exportError}</p>
          </div>
        </div>
      )}

      {exportSuccess && (
        <div
          role="status"
          style={{
            padding: 14,
            marginBottom: 16,
            background: "#f0fdf4",
            border: "1px solid #22c55e",
            borderRadius: 6,
            color: "#166534",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span aria-hidden>✓</span>
          <strong>PDF exported successfully!</strong> The download should open in a new tab.
        </div>
      )}

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
