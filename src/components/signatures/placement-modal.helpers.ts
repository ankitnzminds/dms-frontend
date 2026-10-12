/** Pure helpers for the signature placement box (percent of the page). */

export interface PlacementBox {
  pageNumber: number;
  pageX: number;
  pageY: number;
  pageWidth: number;
  pageHeight: number;
}

// Same starting spot the server falls back to, so the box shown here matches what you'd get by skipping it.
export const DEFAULT_BOX: PlacementBox = {
  pageNumber: 1,
  pageX: 10,
  pageY: 80,
  pageWidth: 30,
  pageHeight: 5,
};
const MIN_WIDTH_PCT = 8;
const MIN_HEIGHT_PCT = 4;

export function clampBox(box: PlacementBox): PlacementBox {
  const pageWidth = Math.min(Math.max(box.pageWidth, MIN_WIDTH_PCT), 100);
  const pageHeight = Math.min(Math.max(box.pageHeight, MIN_HEIGHT_PCT), 100);
  return {
    ...box,
    pageWidth,
    pageHeight,
    pageX: Math.min(Math.max(box.pageX, 0), 100 - pageWidth),
    pageY: Math.min(Math.max(box.pageY, 0), 100 - pageHeight),
  };
}

/** API shape (snake_case) of a box. */
export const toApiPlacement = (b: PlacementBox) => ({
  page_number: b.pageNumber,
  page_x: Math.round(b.pageX * 100) / 100,
  page_y: Math.round(b.pageY * 100) / 100,
  page_width: Math.round(b.pageWidth * 100) / 100,
  page_height: Math.round(b.pageHeight * 100) / 100,
});
