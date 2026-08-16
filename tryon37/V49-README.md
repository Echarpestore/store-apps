# v49 EULERFIX

Fixes:
`Cannot read properties of null (reading 'Euler')`

v48 introduced a separate `THREE_NS` cache, but this project already stores
the imported Three.js namespace as `R.THREE` inside init(). The render path now
uses `new R.THREE.Euler()` directly.

No visual/geometry changes from v47/v48.
