/**
 * CodeCity Components: reusable procedural Three.js pieces in a low-poly, flat-colour
 * city style. Every factory returns a THREE.Group (origin at ground centre).
 * Requires an import map that resolves 'three' (see README).
 */
export { createApartmentBuilding } from './buildings/ApartmentBuilding.js';
export { createSkyscraper } from './buildings/Skyscraper.js';
export { createOfficeBlock } from './buildings/OfficeBlock.js';
export { createShop } from './buildings/Shop.js';
export { createDiner } from './buildings/Diner.js';
export { createSmallHouse } from './buildings/SmallHouse.js';
export { createVault } from './buildings/Vault.js';
// size tiers (wrappers): tall = core modules, medium = mid modules, small = small parts
export { createTallBuilding } from './buildings/TallBuilding.js';
export { createMediumBuilding } from './buildings/MediumBuilding.js';
export { createSmallShop } from './buildings/SmallShop.js';

export { createRoadStraight, ROAD_TOP } from './roads/RoadStraight.js';
export { createRoadIntersection } from './roads/RoadIntersection.js';
export { createRoundabout } from './roads/Roundabout.js';
export { createSidewalk } from './roads/Sidewalk.js';
export { createPath } from './roads/Path.js';
export { createCommonPath } from './roads/CommonPath.js';

export { createStreetLamp } from './props/StreetLamp.js';
export { createTrafficLight } from './props/TrafficLight.js';
export { createBench } from './props/Bench.js';
export { createTrafficCone } from './props/TrafficCone.js';
export { createFountain } from './props/Fountain.js';
export { createGateway } from './props/Gateway.js';

export { createTree } from './greenery/Tree.js';
export { createBush } from './greenery/Bush.js';
export { createGrassPatch } from './greenery/GrassPatch.js';
export { createFlowerBed } from './greenery/FlowerBed.js';
export { createHedge } from './greenery/Hedge.js';
export { createPark } from './greenery/Park.js';

export { createCar } from './vehicles/Car.js';
export { createBike } from './vehicles/Bike.js';
export { createBus } from './vehicles/Bus.js';
export { createTruck } from './vehicles/Truck.js';

export { PALETTE, CAR_COLORS, SHOP_SCHEMES, FLOWER_COLORS } from './shared/palette.js';
export { mat, setMaterialMode, getMaterialMode } from './shared/materials.js';
export * as details from './shared/details.js';
export { codeColors, legendFor, LEGENDS, MODULE_TYPE_COLORS, LANGUAGE_COLORS, UI_PINK } from './shared/colorCoding.js';
