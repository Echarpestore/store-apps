# v45 NATIVE3D

This version changes the rendering approach, not just scale numbers.

The real OBJ now uses its own UV coordinates and `tudung.png` texture with a
MeshStandardMaterial. The old front-projection shader remains only for the
legacy procedural geometry.

Reason: the old projection shader was designed around a flat/template mesh and
was producing the hard rectangular drape/cut visible under the chin when forced
onto the imported OBJ.

Also reset the initial OBJ calibration closer to the model's real proportions.
Face tracking, GPU/CPU fallback, occlusion, and last-pose grace period remain.
