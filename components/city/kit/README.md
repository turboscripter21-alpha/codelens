# Building kit (ported from /workspace/codecity-components)

Low-poly building factories (`createSkyscraper`, `createOfficeBlock`, `createApartmentBuilding`,
`createShop`, `createDiner`, `createSmallHouse`, `createVault`, plus the `TallBuilding`,
`MediumBuilding` and `SmallShop` tier wrappers) and their shared palette / materials / geometry
helpers, copied unchanged from the CodeCity components library.

The app never adds these groups to the scene directly. `components/city/prototypes.ts` calls each
factory ONCE per variant at load, merges the result into one vertex-coloured BufferGeometry, and
`Buildings.tsx` draws every building of that variant with ONE InstancedMesh.

No text or labels are drawn on any building; sign boards are blank.
Style inspired by a low-poly city model by abhi on Sketchfab.
