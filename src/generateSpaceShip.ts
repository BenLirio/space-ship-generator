// Core spaceship generation logic, isolated from Lambda handler concerns.
import { SpaceShip, stringHash, pickDeterministic } from "./utils";
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { readFileSync } from "fs";
import { basename } from "path";

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

  // Placeholder image upload logic (currently static file)
  try {
    const localPath = require.resolve("../assets/spaceship.png");
    const key = `placeholders/${name}-${seed}.png`;

    // Idempotent: check if already exists
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
          Metadata: {
            source: "placeholder",
            file: basename(localPath),
          },
        })
      );
    }
    base.imageUrl = `https://${BUCKET}.s3.amazonaws.com/${key}`;
  } catch (err) {
    base.imageUrl = `https://${BUCKET}.s3.amazonaws.com/unavailable.png`;
    base.notes += ` | Image upload failed: ${(err as Error).message}`;
  }

  return base;
};
