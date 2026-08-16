# v48 THREEFIX

Fixes the v47 runtime crash:
`THREE is not defined`

Cause:
The new body/head damping code was added inside render(), but the THREE
namespace was local to init().

Fix:
Cache the loaded THREE namespace at module scope and reuse a cached Euler
instance in render(). No geometry/visual changes from v47.
