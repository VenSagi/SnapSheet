"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { getErrorMessage } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Asset = {
  id: string;
  original_filename: string;
  width: number;
  height: number;
  file_url: string;
};

type Project = {
  id: string;
  name: string;
};

export default function NewPage() {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createProject = useCallback(async () => {
    const res = await fetch(`${API_URL}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "My Cheat Sheet" }),
    });
    if (!res.ok) {
      const msg = await getErrorMessage(res, `Failed to create project (${res.status})`);
      throw new Error(msg);
    }
    const data = await res.json();
    setProjectId(data.id);
    return data.id;
  }, []);

  const fetchProject = useCallback(async (id: string) => {
    const res = await fetch(`${API_URL}/projects/${id}`);
    if (!res.ok) throw new Error("Failed to fetch project");
    const data = await res.json();
    setAssets(data.assets || []);
  }, []);

  const ensureProject = useCallback(async () => {
    if (projectId) return projectId;
    return createProject();
  }, [projectId, createProject]);

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileList = Array.from(files);
      const imageFiles = fileList.filter((f) =>
        /\.(png|jpg|jpeg|webp)$/i.test(f.name)
      );
      if (imageFiles.length === 0) {
        setError("No valid images. Use PNG, JPG, JPEG, or WebP.");
        return;
      }

      setError(null);
      setUploading(true);
      try {
        const pid = await ensureProject();
        const formData = new FormData();
        imageFiles.forEach((f) => formData.append("files", f));

        const res = await fetch(`${API_URL}/projects/${pid}/assets`, {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const msg = await getErrorMessage(res, `Upload failed (${res.status})`);
          throw new Error(msg);
        }

        await fetchProject(pid);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [ensureProject, fetchProject]
  );

  useEffect(() => {
    if (projectId && assets.length === 0) {
      fetchProject(projectId);
    }
  }, [projectId, assets.length, fetchProject]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (uploading) return;
      const files = e.dataTransfer.files;
      if (files.length) uploadFiles(files);
    },
    [uploadFiles, uploading]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files?.length) uploadFiles(files);
      e.target.value = "";
    },
    [uploadFiles]
  );

  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: 24 }}>
      <h1 style={{ marginBottom: 8 }}>New Cheat Sheet</h1>
      <p style={{ color: "#666", marginBottom: 24 }}>
        Create a project and upload screenshots to get started.
      </p>

      {error && (
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
            <strong>Error</strong>
            <p style={{ margin: "4px 0 0", fontSize: 14 }}>{error}</p>
          </div>
        </div>
      )}

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? "#06c" : "#ccc"}`,
          borderRadius: 8,
          padding: 48,
          textAlign: "center",
          cursor: uploading ? "not-allowed" : "pointer",
          background: dragOver ? "#f0f8ff" : "#fafafa",
          marginBottom: 24,
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
          multiple
          onChange={handleFileChange}
          style={{ display: "none" }}
        />
        {uploading ? (
          <span>Uploading…</span>
        ) : (
          <span>Drop images here or click to select (PNG, JPG, WebP)</span>
        )}
      </div>

      {uploading && (
        <div style={{ marginBottom: 16, color: "#666" }}>
          <span style={{ display: "inline-block", marginRight: 8 }}>
            <span className="spinner" />
          </span>
          Uploading…
        </div>
      )}

      {assets.length > 0 && (
        <>
          <h2 style={{ marginBottom: 16 }}>Uploaded ({assets.length})</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
              gap: 12,
              marginBottom: 24,
            }}
          >
            {assets.map((a) => (
              <div
                key={a.id}
                style={{
                  aspectRatio: "1",
                  overflow: "hidden",
                  borderRadius: 4,
                  border: "1px solid #ddd",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={a.file_url}
                  alt={a.original_filename}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              </div>
            ))}
          </div>

          {projectId && (
            <Link
              href={`/editor/${projectId}`}
              style={{
                display: "inline-block",
                padding: "10px 20px",
                background: "#06c",
                color: "white",
                borderRadius: 4,
                textDecoration: "none",
              }}
            >
              Continue to Editor
            </Link>
          )}
        </>
      )}
    </main>
  );
}
