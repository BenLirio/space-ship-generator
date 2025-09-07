// Root re-export file: keeps serverless.yml handler paths stable while delegating
export { generateSpaceShipHandler } from "./handler/generateSpaceShip";
export { generateSpriteSheetHandler } from "./handler/generateSpriteSheet";
export { diffBoundingBoxHandler } from "./handler/diffBoundingBox";
export { resizeHandler } from "./handler/resize";
export { nameShipHandler } from "./handler/nameShip";
export { scoreboardSetHandler } from "./handler/scoreboardSet";
export { scoreboardListHandler } from "./handler/scoreboardList";
export { getNumRemainingShipsHandler } from "./handler/getNumRemainingShips";
