// Centralised configuration & constants

export const EXAMPLE_IMAGE_PATHS = [
  "assets/no_shooting/example_1.png",
  "assets/no_shooting/example_2.png",
  "assets/no_shooting/example_3.png",
];

export const GEMINI_MODEL =
  process.env.SPACE_SHIP_GEMINI_MODEL || "gemini-2.5-flash-image-preview";

export const BUCKET = process.env.SPACE_SHIP_BUCKET || "space-ship-sprites";

export const ENFORCED_STYLE_CONSTRAINTS = `
RENDERING CONSTRAINTS (MANDATORY):
1. Orientation: Strict top-down (orthographic) view. The spaceship nose/front must point UP toward the top edge of the canvas (0° rotation). No tilt, no isometric, no perspective, no side or angled views.
2. Thrusters should be ignited and in the back/bottom of the ship, 180° facing down.
3. The spaceship should exactly two guns facing UP (0° rotation) mounted symmetrically on either side of the ship's nose/front or wings. No other weapons should be visible.
`;

// export const ENFORCED_STYLE_CONSTRAINTS = `
// RENDERING CONSTRAINTS (MANDATORY):
// 1. Orientation: Strict top-down (orthographic) view. The spaceship nose/front must point UP toward the top edge of the canvas (0° rotation). No tilt, no isometric, no perspective, no side or angled views.
// 2. Thrusters should be ignited and in the back/bottom of the ship, 180° facing down.
// 3. The spaceship should exactly two guns facing UP (0° rotation) mounted symmetrically on either side of the ship's nose/front or wings. These weapons should have a muzzle flash and no other weapons should be visible.
// `;

export const ENFORCED_STYLE_CONSTRAINTS_V2 = `
1. Do not modify the thruster of the ship. Any thruster existing on the provided image should remain in you generated image.
2. Do not modify the weaponry on the ship. Any weaponry in the provided image should remain in your generated image.
`;

export const ENFORCED_STYLE_CONSTRAINTS_LEGACY = `
RENDERING CONSTRAINTS (MANDATORY):
// 2. The spaceship should exactly two weapons facing UP (0° rotation) mounted symmetrically on either side of the ship's nose/front or wings. No other weapons should be visible.
1. Orientation: Strict top-down (orthographic) view. The spaceship nose/front must point UP toward the top edge of the canvas (0° rotation). No tilt, no isometric, no perspective, no side or angled views.
2. Framing: The ship is centered vertically and horizontally, fully in frame, slight padding around extremities.
3. Background: Solid, pure #000000 black. No stars, nebulae, gradients, textures, grids, UI, text, borders, vignettes, glows, or atmospheric haze. Only the ship on black.
4. Lighting/Shadows: Consistent with a neutral, subtle overhead light; avoid dramatic rim lights that imply angled perspective.
5. Style: Match line weight, shading approach, and palette treatment from the provided reference images.
6. Negative constraints: Do NOT show horizon lines, cockpits from side, landing gear on ground, terrain, hangars, pilots, crew, or angled/3D perspective views. Do not crop the ship.
7. Output: Single PNG style image (no collage, no multiple variants).
`;
