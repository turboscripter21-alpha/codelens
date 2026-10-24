/* CodeLens feature flags: one switch per optional city feature.
   Everything is ON for now (Maverick: "include everything"); flip a flag to false to
   remove that feature. You can also try a flag for one visit with the URL, e.g.
   workspace.html?ff=traffic:0,glowArtery:0 */
export const FEATURES = {
  glowArtery: true,      // the glowing main artery / common path (CommonPath) through downtown; false = plain roads only
  traffic: true,         // moving bikes, cars, buses and trucks on the road grid
  folderLabels: true,    // HTML folder labels on the ground (toggle in the workspace, never painted on buildings)
  colorCoding: true,     // colour-code toggle: none / module type / language (default view is none)
  connectionLines: true, // hover / select highlight: shells plus arcs to Uses (orange) and Used by (blue)
  parks: true,           // green lots and grass strips with trees in leftover block space, park blocks in empty cells
  plazas: true,          // fountain plaza with benches in blocks with 6+ buildings
  gateway: true,         // the Gateway and exit road at the east edge (cars to the outside world)
  lamps: true,           // street lamps along every road
  trees: true,           // tree ring around the city
  subPlots: true,        // nested folders as slightly raised sub-plots inside a block
  footpaths: true,       // footpaths between back-to-back rows of lots
  tooltip: true,         // hover tooltip with the file name
  shadows: true,         // sun shadows
  dayNight: true,        // day / night toggle: sun + warm sky by day; moon, stars, lit windows and lamp glow at night
  healthColors: true,    // "Colour: code health" mode: green / yellow / red by the analyzer's complexity score, plus the score in the panel
  buildingChat: true,    // double-click a building: it introduces itself and answers questions (Gemini optional)
  summary: true,         // Summary button: a mini city builds file by file like a slideshow, starting from the entry file
  whereToStart: true,    // numbered markers + list of ~5 files to read first
  search: true,          // Ctrl+K or "/" search over files, paths, functions and exports
  accounts: true,        // email sign-in (6-digit code) or guest, and the History panel
};
/* Caps that keep big repos smooth. */
export const LIMITS = { bikes: 36, cars: 8, trucks: 6, buses: 4, arcs: 30, labels: 80 };

try {
  const ff = new URLSearchParams(location.search).get('ff');
  if (ff) for (const kv of ff.split(',')) { const [k, v] = kv.split(':'); if (Object.prototype.hasOwnProperty.call(FEATURES, k)) FEATURES[k] = v !== '0' && v !== 'false'; }
} catch (err) { /* not in a browser */ }
