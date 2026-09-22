/**
 * The SRL compass mark as PDFKit vector path data.
 *
 * SOURCE OF TRUTH IS THE SVG, NOT THIS FILE. frontend/public/brand/
 * srl-logo-fullcolour.svg is the committed master (viewBox 0 0 512 512, three
 * <path> elements, fills #0A2540 x2 and #BA7517). This module is a verbatim
 * copy of those three paths so the PDF chrome can draw the mark through
 * PDFKit's native doc.path() -- a true vector at every size, exact fills, no
 * raster and no svg-to-pdfkit dependency. A copy is a second source of truth
 * by construction, so __tests__/unit/lib/srlMark.test.ts pins every d= string
 * and fill here to the SVG and goes red on any divergence. Edit the SVG, then
 * regenerate this file; never the other way round.
 *
 * Why vector (v3.8.bfv): drawCompassMark used to embed one of four bundled PNGs
 * chosen by resolveCompassPng, which picked the smallest asset whose pixel
 * count was >= the placed size IN POINTS -- it selected for 72 ppi. The
 * letterhead drew a 120px raster across a 72pt (1in) box: 120 ppi. The training
 * certificate drew 60px across 56pt: 77 ppi. The agreement cover seal drew
 * 480px across 367pt: 94 ppi. Every SRL document printed a soft mark. A path
 * has no resolution.
 *
 * Placement contract, unchanged from the raster era: the mark occupies exactly
 * [x, x+size] x [y, y+size]. translate(x, y) then scale(size / 512).
 */
import type PDFDocument from "pdfkit";

type PDFDoc = InstanceType<typeof PDFDocument>;

export const SRL_MARK_VIEWBOX = 512;

export interface SrlMarkPath {
  /** One of the two brand tokens; asserted against TOKENS in the guard test. */
  readonly fill: "#0A2540" | "#BA7517";
  /** SVG path data, verbatim from the master. */
  readonly d: string;
}

export const SRL_MARK_PATHS: readonly SrlMarkPath[] = [
  {
    fill: "#0A2540",
    d: "M273.49,66.88L255.86,0l-16.96,66.84c-92.65,8.15-166.78,82.55-175.37,175.83L0,258.44l63.22,17.09c7.21,97.09,85.33,174.61,182.13,179.83-.24-4.69-.72-10.51-1.62-17.32-.79-5.99-2.08-11.61-3.77-17.03-3.87-12.51-9.75-24.12-16.02-37.38-8.98-19.03-25.35-44.14-24.81-83.53.52-39.36,37.74-69.23,37.74-69.23,40.38-27.48,100.03-47.17,131.49-53.64,7.55-1.55,14.37-3.04,20.43-4.44,17.14-3.98,28.4-7.23,34.48-9.12-30.62-53.44-85.75-90.95-149.77-96.8ZM271.19,199.6c-60.99,27.76-78.4,66.88-83.42,90.38-5.01,23.51,3.17,55.25,13.74,79.29,9.74,22.19,20.16,42.81,23.78,49.59-23.52-4.58-45.21-14.43-63.79-28.28-39.39-29.22-64.93-76.37-64.93-129.52,0-88.78,71.28-160.76,159.19-160.76,53.42,0,100.69,26.56,129.56,67.34.1.13.2.28.29.39-16.95,1.98-65.27,9.23-114.41,31.57Z",
  },
  {
    fill: "#0A2540",
    d: "M512,258.44l-63.46,17.17c-5.56,74.66-53.06,137.71-118.73,165.23-.78,2.81-1.69,5.64-2.69,8.51-11.88,34.37-52.82,56.82-88.72,62.65,0,0,21.53-28.47,29.75-56.72,1.54-5.3,2.61-10.61,2.99-15.7.45-6.04-.1-12.22-1.43-18.38-5.56-26.73-25-53.7-37.64-73.04-15.59-23.78-22.19-69.5,6.32-101.75,28.51-32.23,80-47.57,119.32-58.39,13.54-3.73,25.64-5.92,36-7.18,18.98-2.31,32.19-1.45,37.8-1.07v.02c.02.07.07.1.09.17-2.68.71-14.75,4.02-32.81,10.56-18.27,6.59-42.63,16.46-69.59,30.25-57.29,29.35-60.45,68.19-57.02,81.94,3.45,13.75,17.96,37.53,41.46,61.03,11.43,11.44,17.75,23.9,19.84,37.63,48.61-27.52,81.45-80.03,81.45-140.3,0-19.86-3.56-38.86-10.1-56.42l32.88-9.58c5.39,15.08,8.98,31.01,10.5,47.57l63.77,15.82Z",
  },
  {
    fill: "#BA7517",
    d: "M187.77,289.98c-5.01,23.51,3.17,55.25,13.74,79.29,9.74,22.19,20.16,42.81,23.78,49.59-23.52-4.58-45.21-14.43-63.79-28.28-10.35-15.25-21.33-39.03-23.36-72.84-3.96-66.59,76.83-119.19,124.86-131.08,44.83-11.08,90.47-17.58,122.31-19.02.1.13.2.28.29.39-16.95,1.98-65.27,9.23-114.41,31.57-60.99,27.76-78.4,66.88-83.42,90.38Z",
  },
];

/**
 * Draw the mark with its top-left at (x, y), size x size points. Wrapped in
 * save/restore so the caller's transform and fill colour are untouched; an
 * opacity set by the caller BEFORE calling (the agreement cover seal at 15%)
 * is inherited, because PDFKit graphics state nests.
 */
export function drawSrlMark(doc: PDFDoc, x: number, y: number, size: number): void {
  doc.save();
  doc.translate(x, y).scale(size / SRL_MARK_VIEWBOX);
  for (const p of SRL_MARK_PATHS) doc.path(p.d).fill(p.fill);
  doc.restore();
}
