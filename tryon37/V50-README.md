# v50 MESHY GLB
Uses the user-provided Meshy GLB as the default live AR garment.
- GLTFLoader loads assets/hijab-meshy.glb.
- Embedded Meshy PBR textures/materials are preserved.
- Model is bbox-normalized automatically.
- Existing MediaPipe pose/tracking and occlusion pipeline is reused.
- `?procedural=1` switches back to the old generated mesh for comparison.

Note: the GLB is ~80 MB, so first load on mobile can take noticeably longer.
