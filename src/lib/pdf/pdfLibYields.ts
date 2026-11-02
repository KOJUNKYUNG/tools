// By default pdf-lib yields through setTimeout(0) every 50 to 100 objects, so that
// the page can draw. A hidden tab runs timers once a second, later once a minute,
// so a run that takes a second on screen crawled for minutes while the user was
// away (CONTEXT "Leaving the screen"). Yielding only every 5000 objects keeps both:
// real files have about 300 objects per MB at most, so one under 15 MB meets no
// timer and a 50 MB one a few, while a file of very many objects still lets the
// page draw between about 0.5 s of reading or writing. With no yields at all such
// a file froze the page for up to 10 s, against 6 s of copying pages, which never
// yields. Measurements are on issue #140.

import type { LoadOptions, SaveOptions } from "pdf-lib";

const OBJECTS_BETWEEN_YIELDS = 5000;

export const LOAD_WITH_RARE_YIELDS: LoadOptions = { parseSpeed: OBJECTS_BETWEEN_YIELDS };
export const SAVE_WITH_RARE_YIELDS: SaveOptions = { objectsPerTick: OBJECTS_BETWEEN_YIELDS };
