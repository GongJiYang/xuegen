/**
 * Chicago motion constants.
 *
 * Every duration and step count lives here so the micro-interactions can be
 * checked against the design spec (`docs/desktop/skins/chicago.md` §5) without
 * hunting through components. All timings are the design's; changing one is a
 * visual change and must be reflected in the design document.
 */

/** The zoom-rectangle appear: 6 dashed rects, one per step, 30ms apart (180ms total). */
export const ZOOM_RECT_STEPS = 6;
export const ZOOM_RECT_STEP_MS = 30;

/** Menu-item confirmation flash: 3 blink cycles, each 40ms off + 40ms on. */
export const MENU_FLASH_CYCLES = 3;
export const MENU_FLASH_HALF_MS = 40;

/** The menu-bar alert flash (System 6 "visual beep"), plus the full cycle. */
export const MENUBAR_ALERT_MS = 100;

/**
 * New-message "print" reveal: one pixel row per tick, capped so the total stays
 * under the design's 200ms ceiling (12 steps × 16ms = 192ms).
 */
export const PRINT_LINE_PX = 2;
export const PRINT_MAX_STEPS = 12;
export const PRINT_STEP_MS = 16;

/** Disclosure triangle rotation: two 45° steps, 40ms each. */
export const TRIANGLE_STEP_MS = 40;

/** Progress bar growth: 4px cells, 16ms per cell, plus a 30ms digit settle. */
export const PROGRESS_CELL_PX = 4;
export const PROGRESS_STEP_MS = 16;
export const DIGIT_STEP_MS = 30;

