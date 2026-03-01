import { INCH_TO_POINTS, PAGE_SIZES, type Orientation, type PaperSize } from "./constants";

export type Placement = { assetId: string; x: number; y: number; w: number; h: number };

export type LayoutSettings = {
  paper: PaperSize;
  orientation: Orientation;
  margins: { top: number; right: number; bottom: number; left: number };
  targetPages: number;
};

type AssetWithSize = { id: string; width: number; height: number };

/**
 * Generate placements for all assets across pages.
 * Uses uniform grid: 2 cols portrait, 3 cols landscape.
 * Keeps aspect ratio; centers image in each cell.
 */
export function computeAutolayout(
  assets: AssetWithSize[],
  settings: LayoutSettings
): Record<number, Placement[]> {
  const { paper, orientation, margins, targetPages } = settings;
  const pts = PAGE_SIZES[paper];
  const [pageW, pageH] =
    orientation === "landscape" ? [pts.h, pts.w] : [pts.w, pts.h];

  const contentW = pageW - margins.left * INCH_TO_POINTS - margins.right * INCH_TO_POINTS;
  const contentH = pageH - margins.top * INCH_TO_POINTS - margins.bottom * INCH_TO_POINTS;
  const contentX = margins.left * INCH_TO_POINTS;
  const contentY = margins.top * INCH_TO_POINTS;

  const cols = orientation === "portrait" ? 2 : 3;
  const imagesPerPage = Math.max(1, Math.ceil(assets.length / targetPages));
  const rows = Math.ceil(imagesPerPage / cols);

  const cellW = contentW / cols;
  const cellH = contentH / rows;

  const result: Record<number, Placement[]> = {};
  let assetIdx = 0;

  for (let page = 0; page < targetPages && assetIdx < assets.length; page++) {
    const placements: Placement[] = [];
    const pageAssetCount = Math.min(
      imagesPerPage,
      assets.length - assetIdx
    );
    const pageRows = Math.ceil(pageAssetCount / cols);

    for (let r = 0; r < pageRows && assetIdx < assets.length; r++) {
      for (let c = 0; c < cols && assetIdx < assets.length; c++) {
        const asset = assets[assetIdx];
        const cellX = contentX + c * cellW;
        const cellY = contentY + r * cellH;

        const scale = Math.min(
          cellW / asset.width,
          cellH / asset.height
        );
        const w = asset.width * scale;
        const h = asset.height * scale;
        const x = cellX + (cellW - w) / 2;
        const y = cellY + (cellH - h) / 2;

        placements.push({ assetId: asset.id, x, y, w, h });
        assetIdx++;
      }
    }
    result[page] = placements;
  }

  return result;
}
