// Centralised configuration & constants

export const EXAMPLE_IMAGE_PATHS = [
  "assets/example_4.png",
  "assets/example_5.png",
  "assets/example_6.png",
];

export const GEMINI_MODEL =
  process.env.SPACE_SHIP_GEMINI_MODEL || "gemini-2.5-flash-image-preview"; // easy override

export const BUCKET = process.env.SPACE_SHIP_BUCKET || "space-ship-sprites";

export const ENFORCED_STYLE_CONSTRAINTS = `RENDERING CONSTRAINTS (MANDATORY):\n1. Orientation: Strict top-down (orthographic) view. The spaceship nose/front must point UP toward the top edge of the canvas (0° rotation). No tilt, no isometric, no perspective, no side or angled views.\n2. Framing: The ship is centered vertically and horizontally, fully in frame, slight padding around extremities.\n3. Background: Solid, pure #000000 black. No stars, nebulae, gradients, textures, grids, UI, text, borders, vignettes, glows, or atmospheric haze. Only the ship on black.\n4. Lighting/Shadows: Consistent with a neutral, subtle overhead light; avoid dramatic rim lights that imply angled perspective.\n5. Style: Match line weight, shading approach, and palette treatment from the provided reference images.\n6. Negative constraints: Do NOT show horizon lines, cockpits from side, landing gear on ground, terrain, hangars, pilots, crew, or angled/3D perspective views. Do not crop the ship.\n7. Output: Single PNG style image (no collage, no multiple variants).`;
