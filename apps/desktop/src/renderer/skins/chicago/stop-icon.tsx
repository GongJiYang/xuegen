/**
 * The 32×32 stop-sign glyph the Chicago alert dialog shows.
 *
 * Extracted so the Shell's modal alert and the gallery's inline Notice slot
 * share one drawing. It is a 1-bit shape built from 1px rectangles, coloured by
 * `currentColor` so it follows the palette.
 */

export function StopIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 32 32"
      shapeRendering="crispEdges"
      aria-hidden="true"
      fill="currentColor"
    >
      <path d="M10 0h12v1H10zM9 1h1v1H9zM22 1h1v1h-1zM8 2h1v1H8zM23 2h1v1h-1zM7 3h1v1H7zM24 3h1v1h-1zM6 4h1v1H6zM25 4h1v1h-1zM5 5h1v1H5zM26 5h1v1h-1zM4 6h1v1H4zM27 6h1v1h-1zM3 7h1v1H3zM28 7h1v1h-1zM2 8h1v1H2zM29 8h1v1h-1zM1 9h1v1H1zM30 9h1v1h-1zM0 10h1v12H0zM31 10h1v12h-1zM1 22h1v1H1zM30 22h1v1h-1zM2 23h1v1H2zM29 23h1v1h-1zM3 24h1v1H3zM28 24h1v1h-1zM4 25h1v1H4zM27 25h1v1h-1zM5 26h1v1H5zM26 26h1v1h-1zM6 27h1v1H6zM25 27h1v1h-1zM7 28h1v1H7zM24 28h1v1h-1zM8 29h1v1H8zM23 29h1v1h-1zM9 30h1v1H9zM22 30h1v1h-1zM10 31h12v1H10z" />
      <path d="M14 7h4v12h-4zM14 22h4v4h-4z" />
    </svg>
  );
}
