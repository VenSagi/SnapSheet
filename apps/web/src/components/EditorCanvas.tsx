"use client";

import { Stage, Layer, Image as KonvaImage, Transformer, Rect } from "react-konva";
import Konva from "konva";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Placement } from "@/lib/autolayout";
import { PAGE_SIZES, type Orientation, type PaperSize } from "@/lib/constants";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Asset = { id: string; width: number; height: number; file_url: string };

type Props = {
  assets: Asset[];
  placements: Record<number, Placement[]>;
  pageIndex: number;
  paper: PaperSize;
  orientation: Orientation;
  margins: { top: number; right: number; bottom: number; left: number };
  onPlacementsChange: (pageIndex: number, placements: Placement[]) => void;
};

const SCALE = 1.2;

function useImage(url: string): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    const image = new window.Image();
    image.crossOrigin = "anonymous";
    image.src = url.startsWith("http") ? url : `${API_URL}${url}`;
    image.onload = () => setImg(image);
    return () => image.onload = null;
  }, [url]);
  return img;
}

function DraggableImage({
  placement,
  asset,
  isSelected,
  onSelect,
  onChange,
}: {
  placement: Placement;
  asset: Asset;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (p: Placement) => void;
}) {
  const shapeRef = useRef<Konva.Image>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const img = useImage(asset.file_url);

  useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
    }
  }, [isSelected]);

  if (!img) return null;

  return (
    <>
      <KonvaImage
        ref={shapeRef}
        image={img}
        x={placement.x}
        y={placement.y}
        width={placement.w}
        height={placement.h}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={(e) => {
          const node = e.target;
          onChange({
            ...placement,
            x: node.x(),
            y: node.y(),
          });
        }}
        onTransformEnd={(e) => {
          const node = shapeRef.current;
          if (!node) return;
          const scaleX = node.scaleX();
          const scaleY = node.scaleY();
          node.scaleX(1);
          node.scaleY(1);
          onChange({
            ...placement,
            x: node.x(),
            y: node.y(),
            w: Math.max(20, node.width() * scaleX),
            h: Math.max(20, node.height() * scaleY),
          });
        }}
      />
      {isSelected && (
        <Transformer
          ref={trRef}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 20 || newBox.height < 20) return oldBox;
            return newBox;
          }}
        />
      )}
    </>
  );
}

export default function EditorCanvas({
  assets,
  placements,
  pageIndex,
  paper,
  orientation,
  margins,
  onPlacementsChange,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const layerRef = useRef<Konva.Layer>(null);

  const pts = PAGE_SIZES[paper];
  const [pageW, pageH] = orientation === "landscape" ? [pts.h, pts.w] : [pts.w, pts.h];
  const stageW = pageW * SCALE;
  const stageH = pageH * SCALE;

  const pagePlacements = useMemo(
    () => placements[pageIndex] || [],
    [placements, pageIndex]
  );

  const handleChange = useCallback(
    (assetId: string, updater: (p: Placement) => Placement) => {
      const next = pagePlacements.map((p) =>
        p.assetId === assetId ? updater(p) : p
      );
      onPlacementsChange(pageIndex, next);
    },
    [pageIndex, pagePlacements, onPlacementsChange]
  );

  return (
    <div
      style={{
        border: "1px solid #ccc",
        borderRadius: 4,
        overflow: "hidden",
        background: "#f5f5f5",
      }}
    >
      <Stage
        width={stageW}
        height={stageH}
        scaleX={SCALE}
        scaleY={SCALE}
        onClick={(e) => {
          if (e.target === e.target.getStage()) setSelectedId(null);
        }}
      >
        <Layer ref={layerRef}>
          {/* Page background */}
          <Rect
            x={0}
            y={0}
            width={pageW}
            height={pageH}
            fill="white"
            shadowColor="black"
            shadowBlur={4}
            shadowOffsetX={2}
            shadowOffsetY={2}
          />
          {pagePlacements.map((placement) => {
            const asset = assets.find((a) => a.id === placement.assetId);
            if (!asset) return null;
            return (
              <DraggableImage
                key={placement.assetId}
                placement={placement}
                asset={asset}
                isSelected={selectedId === placement.assetId}
                onSelect={() => setSelectedId(placement.assetId)}
                onChange={(p) => handleChange(placement.assetId, () => p)}
              />
            );
          })}
        </Layer>
      </Stage>
    </div>
  );
}
