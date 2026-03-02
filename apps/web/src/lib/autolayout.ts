import { INCH_TO_POINTS, PAGE_SIZES, type Orientation, type PaperSize } from "./constants";

export type Placement = {
  assetId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
};

export type LayoutSettings = {
  paper: PaperSize;
  orientation: Orientation;
  margins: { top: number; right: number; bottom: number; left: number };
  targetPages: number;
};

type AssetWithSize = { id: string; width: number; height: number };

/**
 * Find the grid (cols x rows) that maximizes the minimum image scale
 * for the given assets, filling the content area.
 */
function findBestGrid(
  pageAssets: AssetWithSize[],
  contentW: number,
  contentH: number
): { cols: number; rows: number } {
  const n = pageAssets.length;
  if (n <= 0) return { cols: 1, rows: 1 };
  if (n === 1) return { cols: 1, rows: 1 };

  let best = { cols: 1, rows: 1, minScale: 0 };

  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const cellW = contentW / cols;
    const cellH = contentH / rows;

    let minScale = Infinity;
    for (const asset of pageAssets) {
      const s = Math.min(cellW / asset.width, cellH / asset.height);
      minScale = Math.min(minScale, s);
    }

    if (minScale > best.minScale) {
      best = { cols, rows, minScale };
    }
  }

  return { cols: best.cols, rows: best.rows };
}

/**
 * Distribute assets across pages by AREA (not just count) to balance load.
 * Uses greedy bin-packing: assign each image to the page with smallest total area.
 * Ensures every page gets at least 1 image (no empty pages).
 */
function distributeByArea(
  assets: AssetWithSize[],
  numPages: number
): AssetWithSize[][] {
  const n = assets.length;
  if (n <= 0 || numPages <= 0) return [];

  // Sort by area descending (largest first) for better packing
  const withArea = assets.map((a) => ({
    asset: a,
    area: a.width * a.height,
  }));
  withArea.sort((a, b) => b.area - a.area);

  // Each page: { assets: AssetWithSize[], totalArea: number }
  const pages: { assets: AssetWithSize[]; totalArea: number }[] = Array.from(
    { length: numPages },
    () => ({ assets: [], totalArea: 0 })
  );

  // Greedy: assign each asset to the page with smallest total area
  for (const { asset } of withArea) {
    let minIdx = 0;
    let minArea = pages[0].totalArea;
    for (let i = 1; i < numPages; i++) {
      if (pages[i].totalArea < minArea) {
        minArea = pages[i].totalArea;
        minIdx = i;
      }
    }
    pages[minIdx].assets.push(asset);
    pages[minIdx].totalArea += asset.width * asset.height;
  }

  return pages.map((p) => p.assets);
}

/**
 * Generate placements for all assets across pages.
 * - Uses AREA-based distribution to balance load (not just count)
 * - Never creates empty pages: uses min(n, targetPages) pages when n < targetPages
 * - Maximizes image size via findBestGrid per page
 */
export function computeAutolayout(
  assets: AssetWithSize[],
  settings: LayoutSettings
): Record<number, Placement[]> {
  const { paper, orientation, margins, targetPages } = settings;
  const pts = PAGE_SIZES[paper];
  const [pageW, pageH] =
    orientation === "landscape" ? [pts.h, pts.w] : [pts.w, pts.h];

  const marginLeftPt = margins.left * INCH_TO_POINTS;
  const marginRightPt = margins.right * INCH_TO_POINTS;
  const marginTopPt = margins.top * INCH_TO_POINTS;
  const marginBottomPt = margins.bottom * INCH_TO_POINTS;

  const contentX = marginLeftPt;
  const contentY = marginTopPt;
  const contentRight = pageW - marginRightPt;
  const contentBottom = pageH - marginBottomPt;
  const contentW = contentRight - contentX;
  const contentH = contentBottom - contentY;

  const n = assets.length;
  if (n === 0) return { 0: [] };

  // Use only as many pages as we need - NEVER create empty pages
  const numPages = Math.min(Math.max(1, targetPages), Math.max(1, n));

  const pageAssetLists = distributeByArea(assets, numPages);

  const result: Record<number, Placement[]> = {};
  let assetIdx = 0;

  for (let page = 0; page < numPages; page++) {
    const pageAssets = pageAssetLists[page];
    if (pageAssets.length === 0) continue; // skip (shouldn't happen with area distribution)

    const placements: Placement[] = [];
    const { cols, rows } = findBestGrid(pageAssets, contentW, contentH);
    const cellW = contentW / cols;
    const cellH = contentH / rows;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        if (idx >= pageAssets.length) break;
        const asset = pageAssets[idx];

        const scale = Math.min(
          cellW / asset.width,
          cellH / asset.height
        );
        let w = asset.width * scale;
        let h = asset.height * scale;
        let x = contentX + c * cellW + (cellW - w) / 2;
        const y = contentY + r * cellH + (cellH - h) / 2;

        const rightEdge = x + w;
        if (rightEdge > contentRight) {
          w = Math.max(20, contentRight - x);
          h = asset.height * (w / asset.width);
        }
        const bottomEdge = y + h;
        if (bottomEdge > contentBottom) {
          h = Math.max(20, contentBottom - y);
          w = asset.width * (h / asset.height);
        }

        placements.push({ assetId: asset.id, x, y, w, h });
      }
    }

    result[page] = placements;
  }

  return result;
}
