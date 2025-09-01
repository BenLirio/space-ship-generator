// Thin compatibility shim re-exporting refactored implementation.
export { buildSpaceShip } from "./buildSpaceShip";
// Backward compatibility: external code importing generateSpaceShip now gets buildSpaceShip semantics.
export { generateSpaceShipAsset as generateSpaceShip } from "./buildSpaceShip";
export { generateSpaceShipAsset } from "./buildSpaceShip";
