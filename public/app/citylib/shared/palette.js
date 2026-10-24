/**
 * palette.js: Colours sampled from the reference low-poly city model's
 * "Multicolor" palette texture (UV cells weighted by how often the model uses them),
 * then grouped by role. Every component pulls its defaults from here, so changing a
 * value here re-themes the whole library.
 */
export const PALETTE = {
  // ground & roads
  asphalt: '#262626', asphaltDark: '#1a1a1a', roadLine: '#f2f2f2', roadLineYellow: '#fdf830',
  sidewalk: '#a6a6a6', sidewalkDark: '#8c8c8c', curb: '#d9d9d9', concrete: '#737373',
  grass: '#b5d84f', grassDark: '#7cdb04', dirtPath: '#b5852a', soil: '#371b13',
  // greenery
  leaf: '#2b8313', leafDark: '#12742e', leafLight: '#22c50b', leafLime: '#4fae03', trunk: '#371b13',
  // walls
  brick: '#98200f', brickBright: '#b8160d', brickDark: '#53191a',
  cream: '#f0e2c1', creamLight: '#f5edcd', creamWarm: '#f2e8ca', offWhite: '#e6e6e6', white: '#f8faf8',
  orange: '#ff6c0d', orangeSoft: '#fd9e13', apricot: '#fdad36', terracotta: '#d0744b',
  lime: '#7cdb04', limeSoft: '#8fe03a', green: '#038458', teal: '#0a9795',
  blue: '#202da9', blueBright: '#0765d4', blueDeep: '#0845a5',
  red: '#e51907', redDark: '#bb110f', pink: '#ff3fc3', yellow: '#ffcc2b', yellowSoft: '#f0c921',
  // glass & details
  glass: '#0584a8', glassLight: '#38829e', windowWarm: '#f5edcd', windowLit: '#fee11c',
  metal: '#595959', metalLight: '#a6a6a6', metalDark: '#404040', black: '#160b10', charcoal: '#333333',
  wood: '#7b3b19', woodLight: '#cb8511', tyre: '#1a1a1a', hub: '#a6a6a6',
  water: '#0584a8', stone: '#808080', stoneLight: '#b2b2b2',
};

/** Handy colour sets for random-but-on-style variation. */
export const CAR_COLORS = ['#f43408', '#e51907', '#202da9', '#0765d4', '#fdf830', '#f8faf8', '#038458', '#ff6c0d'];
export const SHOP_SCHEMES = [
  { wall: '#7cdb04', rim: '#038458', awning: ['#ff3fc3', '#f8faf8'], sign: '#f0e2c1' },
  { wall: '#f0e2c1', rim: '#ff6c0d', awning: ['#ff6c0d', '#f8faf8'], sign: '#ff6c0d' },
  { wall: '#f5edcd', rim: '#0845a5', awning: ['#e51907', '#f8faf8'], sign: '#0845a5' },
  { wall: '#b5d84f', rim: '#7cdb04', awning: ['#202da9', '#f8faf8'], sign: '#f8faf8' },
];
export const FLOWER_COLORS = ['#e51907', '#ff3fc3', '#fdf830', '#f8faf8', '#ff6c0d', '#7b6993'];
