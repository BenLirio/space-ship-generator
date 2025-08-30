// Core spaceship generation logic, isolated from Lambda handler concerns.
import { SpaceShip, stringHash, pickDeterministic } from "./utils";

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

export const buildSpaceShip = (prompt: string): SpaceShip => {
  const seed = stringHash(prompt.trim().toLowerCase());
  const hull = HULLS[seed % HULLS.length];
  const propulsion = PROPULSION[(seed >> 3) % PROPULSION.length];
  const navigation = NAV_SYSTEMS[(seed >> 7) % NAV_SYSTEMS.length];
  const defense = DEFENSE[(seed >> 11) % DEFENSE.length];
  const modules = pickDeterministic(MODULE_POOL, seed ^ 0x9e3779b9, 4).sort();

  const normalized = prompt.replace(/\s+/g, "-").replace(/[^A-Za-z0-9\-]/g, "");
  const nameBase = normalized.slice(0, 24) || "Vessel";
  const name = `SS-${nameBase}`;

  return {
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
};
