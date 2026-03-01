/** 1 inch = 72 PDF points */
export const INCH_TO_POINTS = 72;

/** Page sizes in points (width x height, portrait) */
export const PAGE_SIZES = {
  Letter: { w: 8.5 * 72, h: 11 * 72 },
  A4: { w: 595, h: 842 },
} as const;

export type PaperSize = keyof typeof PAGE_SIZES;
export type Orientation = "portrait" | "landscape";
