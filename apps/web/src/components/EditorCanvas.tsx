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

  const rotation = placement.rotation ?? 0;
  const hasRotation = rotation !== 0;
  const offsetX = hasRotation ? placement.w / 2 : 0;
  const offsetY = hasRotation ? placement.h / 2 : 0;
  const posX = hasRotation ? placement.x + placement.w / 2 : placement.x;
  const posY = hasRotation ? placement.y + placement.h / 2 : placement.y;

  return (
    <>
      <KonvaImage
        ref={shapeRef}
        image={img}
        x={posX}
        y={posY}
        width={placement.w}
        height={placement.h}
        rotation={rotation}
        offsetX={offsetX}
        offsetY={offsetY}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={(e) => {
          const node = e.target;
          const nx = node.x();
          const ny = node.y();
          const ox = node.offsetX();
          const oy = node.offsetY();
          const topLeftX = ox ? nx - ox : nx;
          const topLeftY = oy ? ny - oy : ny;
          onChange({
            ...placement,
            x: topLeftX,
            y: topLeftY,
          });
        }}
        onTransformEnd={() => {
          const node = shapeRef.current;
          if (!node) return;
          const scaleX = node.scaleX();
          const scaleY = node.scaleY();
          const rot = node.rotation();
          const hadOffset = (node.offsetX() || 0) !== 0 || (node.offsetY() || 0) !== 0;
          node.scaleX(1);
          node.scaleY(1);
          node.rotation(0);
          const newW = Math.max(20, node.width() * scaleX);
          const newH = Math.max(20, node.height() * scaleY);
          node.width(newW);
          node.height(newH);
          node.rotation(rot);
          let topLeftX: number;
          let topLeftY: number;
          if (rot !== 0) {
            node.offsetX(newW / 2);
            node.offsetY(newH / 2);
            const pos = node.position();
            if (hadOffset) {
              topLeftX = pos.x - newW / 2;
              topLeftY = pos.y - newH / 2;
            } else {
              const centerX = placement.x + placement.w / 2;
              const centerY = placement.y + placement.h / 2;
              topLeftX = centerX - newW / 2;
              topLeftY = centerY - newH / 2;
            }
          } else {
            node.offsetX(0);
            node.offsetY(0);
            const pos = node.position();
            topLeftX = pos.x;
            topLeftY = pos.y;
          }
          onChange({
            ...placement,
            x: topLeftX,
            y: topLeftY,
            w: newW,
            h: newH,
            rotation: rot,
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
          {/* Page background - click to deselect */}
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
            onClick={() => setSelectedId(null)}
            onTap={() => setSelectedId(null)}
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
