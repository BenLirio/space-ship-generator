// Core spaceship generation logic, isolated from Lambda handler concerns.
import { SpaceShip, stringHash, pickDeterministic } from "./utils";
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { readFileSync, existsSync } from "fs";
import { GoogleGenAI } from "@google/genai";
import { basename, join, resolve } from "path";

// Reference example images (added: example_1.png .. example_3.png)
const EXAMPLE_IMAGES = [
  "assets/example_1.png",
  "assets/example_2.png",
  "assets/example_3.png",
];
const HULLS = [
  "CarbonFiber",
  "TitaniumAlloy",
  "GrapheneComposite",
  "NanoCeramic",
  "BioHull",
];

const PROPULSION = [
  "IonDrive",
  "FusionPulse",
  "Antimatter",
  "SolarSail",
  "QuantumSlipstream",
];

const NAV_SYSTEMS = [
  "InertialNav",
  "QuantumStarMap",
  "GravimetricArray",
  "AIHelm",
  "ChronoNavigator",
];

const DEFENSE = [
  "PlasmaShield",
  "DeflectorArray",
  "PhaseShiftField",
  "ReactiveArmor",
  "StealthWeave",
];

const MODULE_POOL = [
  "MedBay",
  "Hydroponics",
  "CargoBay",
  "ResearchLab",
  "Hangar",
  "DroneForge",
  "ObservationDeck",
  "AICore",
  "CryoPods",
  "WarpCapacitors",
];

const s3 = new S3Client({});
const BUCKET = process.env.SPACE_SHIP_BUCKET || "space-ship-sprites";

export const buildSpaceShip = async (prompt: string): Promise<SpaceShip> => {
  const seed = stringHash(prompt.trim().toLowerCase());
  const hull = HULLS[seed % HULLS.length];
  const propulsion = PROPULSION[(seed >> 3) % PROPULSION.length];
  const navigation = NAV_SYSTEMS[(seed >> 7) % NAV_SYSTEMS.length];
  const defense = DEFENSE[(seed >> 11) % DEFENSE.length];
  const modules = pickDeterministic(MODULE_POOL, seed ^ 0x9e3779b9, 4).sort();

  const normalized = prompt.replace(/\s+/g, "-").replace(/[^A-Za-z0-9\-]/g, "");
  const nameBase = normalized.slice(0, 24) || "Vessel";
  const name = `SS-${nameBase}`;

  const base: SpaceShip = {
    name,
    promptUsed: prompt,
    hull,
    propulsion,
    navigation,
    defense,
    modules,
    seed,
    notes: "Deterministic generation based on prompt hash (placeholder).",
  };

  // Helper to resolve the reference spaceship image reliably both in source (ts-node)
  // and in the bundled / transpiled Lambda environment.
  const resolveAsset = (relative: string): string => {
    // 1. Path relative to compiled file location (dist or .esbuild)
    const attemptA = resolve(__dirname, "../", relative);
    if (existsSync(attemptA)) return attemptA;
    // 2. Path relative to project root (process.cwd during offline / lambda)
    const attemptB = resolve(process.cwd(), relative);
    if (existsSync(attemptB)) return attemptB;
    // 3. Asset placed alongside compiled file (fallback)
    const attemptC = resolve(
      __dirname,
      relative.split(/\\|\//).pop() || relative
    );
    if (existsSync(attemptC)) return attemptC;
    throw new Error(
      `Asset not found: ${relative} (checked: ${attemptA}, ${attemptB}, ${attemptC})`
    );
  };

  // Gemini image generation logic
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("Missing GEMINI_API_KEY env var");
    // Use ALL bundled example images as style references for richer guidance
    const referenceImageParts = EXAMPLE_IMAGES.map((rel) => {
      const p = resolveAsset(rel);
      const data = readFileSync(p).toString("base64");
      return {
        inlineData: { mimeType: "image/png", data },
      } as any;
    });
    const gemini = new GoogleGenAI({ apiKey });
    // Hard, consistent visual constraints independent of user prompt
    const enforcedStyle = `RENDERING CONSTRAINTS (MANDATORY):
1. Orientation: Strict top-down (orthographic) view. The spaceship nose/front must point UP toward the top edge of the canvas (0° rotation). No tilt, no isometric, no perspective, no side or angled views.
2. Framing: The ship is centered vertically and horizontally, fully in frame, slight padding around extremities.
3. Background: Solid, pure #000000 black. No stars, nebulae, gradients, textures, grids, UI, text, borders, vignettes, glows, or atmospheric haze. Only the ship on black.
4. Lighting/Shadows: Consistent with a neutral, subtle overhead light; avoid dramatic rim lights that imply angled perspective.
5. Style: Match line weight, shading approach, and palette treatment from the provided reference images.
6. Negative constraints: Do NOT show horizon lines, cockpits from side, landing gear on ground, terrain, hangars, pilots, crew, or angled/3D perspective views. Do not crop the ship.
7. Output: Single PNG style image (no collage, no multiple variants).`;

    const geminiPrompt = [
      {
        text: `Generate a spaceship consistent with the visual style cues of ALL provided reference images (they are variations of the same art style). User concept: ${prompt}. ${enforcedStyle}`,
      },
      ...referenceImageParts,
    ];
    const response = await gemini.models.generateContent({
      model: "gemini-2.5-flash-image-preview",
      contents: geminiPrompt as any,
    });

    // Find first inlineData image in response
    let generatedImageBase64: string | undefined;
    if (response?.candidates) {
      for (const c of response.candidates) {
        const parts: any[] = (c as any).content?.parts || [];
        for (const part of parts) {
          if (part.inlineData?.data) {
            generatedImageBase64 = part.inlineData.data;
            break;
          }
        }
        if (generatedImageBase64) break;
      }
    }

    if (!generatedImageBase64) {
      throw new Error("Gemini response lacked image data");
    }

    const buffer = Buffer.from(generatedImageBase64, "base64");
    const key = `generated/${name}-${seed}.png`;

    // Idempotent existence check
    try {
      await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    } catch {
      await s3.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: key,
          Body: buffer,
          ContentType: "image/png",
          Metadata: {
            source: "gemini",
            model: "gemini-2.5-flash-image-preview",
          },
        })
      );
    }
    base.imageUrl = `https://${BUCKET}.s3.amazonaws.com/${key}`;
  } catch (err) {
    // Fallback to placeholder if generation fails
    try {
      // Placeholder: deterministically pick one example (could be extended to composite/cycle)
      const localPath = resolveAsset(
        EXAMPLE_IMAGES[seed % EXAMPLE_IMAGES.length]
      );
      const key = `placeholders/${name}-${seed}.png`;
      try {
        await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
      } catch {
        const body = readFileSync(localPath);
        await s3.send(
          new PutObjectCommand({
            Bucket: BUCKET,
            Key: key,
            Body: body,
            ContentType: "image/png",
            Metadata: { source: "placeholder", file: basename(localPath) },
          })
        );
      }
      base.imageUrl = `https://${BUCKET}.s3.amazonaws.com/${key}`;
    } catch {}
    base.notes += ` | Image generation failed: ${(err as Error).message}`;
  }

  return base;
};
