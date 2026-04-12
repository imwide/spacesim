import * as THREE from 'three';

/**
 * LOD distance thresholds in meters (world units), assigned by sorted order.
 * LOD_00: 0–30m (highest detail)
 * LOD_01: 30–60m
 * LOD_02: 60–100m
 * LOD_03: 100m+ (lowest detail)
 */
const LOD_DISTANCES: readonly number[] = [0, 30, 60, 100];

/** Hysteresis ratio (0–1) to prevent LOD flickering at boundaries. 0.1 = 10% band. */
const LOD_HYSTERESIS = 0.1;

/**
 * Regex to match LOD mesh/group names as produced by Three.js GLTFLoader.
 *
 * Blender exports:    "objectName_LOD_00", "objectName_LOD_01", etc.
 * Three.js deduplicates duplicate names by appending "_N" suffixes:
 *   First instance:   "tanks_LOD_00"
 *   Second instance:  "tanks_LOD_00_1"
 *   Third instance:   "tanks_LOD_00_2"
 *
 * Captures: [1] = base name, [2] = LOD index (00–99)
 */
const LOD_NAME_REGEX = /^(.+)_LOD_(\d{2})(?:_\d+)?$/;

/**
 * Traverses a cloned GLB scene graph and converts Blender collection-instance
 * LOD hierarchies into Three.js LOD objects.
 *
 * Runtime Three.js scene graph structure (after GLTFLoader processing):
 *
 *   "thrusters001" (Object3D)         ← collection instance, dots stripped
 *     └── "thrusters" (Object3D)      ← empty (or "thrusters_1" for duplicates)
 *           ├── "thrusters_LOD_00" (Group/Mesh)
 *           ├── "thrusters_LOD_01" (Group/Mesh)
 *           ├── "thrusters_LOD_02" (Group/Mesh)
 *           └── "thrusters_LOD_03" (Group/Mesh)
 *
 * Detection is purely structural: any node with exactly 1 child, where that
 * child has ≥2 children matching the _LOD_XX pattern, is treated as a LOD group.
 * No name matching between parent and child is required.
 *
 * LOD indices may have gaps — distances are assigned by sorted order.
 * Non-LOD objects are left untouched.
 *
 * @param scene The cloned GLB scene root to process in-place.
 * @returns Array of all THREE.LOD objects created (caller must call lod.update(camera) each frame).
 */
export function setupStationLODs(scene: THREE.Object3D): THREE.LOD[] {
  const lodObjects: THREE.LOD[] = [];

  // Collect candidates first to avoid mutating the tree during traversal.
  const candidates: { parent: THREE.Object3D; node: THREE.Object3D; empty: THREE.Object3D }[] = [];

  scene.traverse((node) => {
    // Structural pattern: node with exactly 1 child (the "empty"),
    // whose children contain LOD-named meshes/groups.
    if (node.children.length !== 1) return;

    const empty = node.children[0];
    if (empty.children.length < 2) return;

    // Check if any children of the empty match the LOD naming convention
    const lodChildren = empty.children.filter((child) => LOD_NAME_REGEX.test(child.name));
    if (lodChildren.length < 2) return;

    // This is a LOD group
    if (node.parent) {
      candidates.push({ parent: node.parent, node, empty });
    }
  });

  for (const { parent, node, empty } of candidates) {
    const lod = new THREE.LOD();

    // Preserve the original transform of the collection instance node
    lod.name = node.name + '_LOD';
    lod.position.copy(node.position);
    lod.quaternion.copy(node.quaternion);
    lod.scale.copy(node.scale);

    // Check if the empty has a non-identity transform that needs to be preserved
    const hasEmptyTransform =
      empty.position.lengthSq() > 1e-8 ||
      empty.quaternion.x !== 0 || empty.quaternion.y !== 0 || empty.quaternion.z !== 0 ||
      Math.abs(empty.scale.x - 1) > 1e-6 || Math.abs(empty.scale.y - 1) > 1e-6 || Math.abs(empty.scale.z - 1) > 1e-6;

    // Collect LOD meshes sorted by their numeric suffix
    const lodMeshes: { index: number; mesh: THREE.Object3D }[] = [];
    const nonLodChildren: THREE.Object3D[] = [];

    for (const child of [...empty.children]) {
      const match = child.name.match(LOD_NAME_REGEX);
      if (match) {
        lodMeshes.push({ index: parseInt(match[2], 10), mesh: child });
      } else {
        nonLodChildren.push(child);
      }
    }

    // Sort by LOD index ascending (LOD_00 first = highest detail = closest distance)
    lodMeshes.sort((a, b) => a.index - b.index);

    // Add each LOD level — distances assigned by sorted position, not by numeric suffix
    // (handles gaps like LOD_00, LOD_01, LOD_03, LOD_04)
    for (let i = 0; i < lodMeshes.length; i++) {
      const { mesh } = lodMeshes[i];
      const distance = LOD_DISTANCES[i] ?? LOD_DISTANCES[LOD_DISTANCES.length - 1];

      // Detach from old parent
      empty.remove(mesh);

      // If the empty had a transform, wrap the mesh in a group that carries it
      if (hasEmptyTransform) {
        const wrapper = new THREE.Group();
        wrapper.position.copy(empty.position);
        wrapper.quaternion.copy(empty.quaternion);
        wrapper.scale.copy(empty.scale);
        wrapper.add(mesh);
        lod.addLevel(wrapper, distance, LOD_HYSTERESIS);
      } else {
        lod.addLevel(mesh, distance, LOD_HYSTERESIS);
      }
    }

    // If there were non-LOD children in the empty, attach them to the LOD object
    // so they remain visible at all distances
    for (const child of nonLodChildren) {
      empty.remove(child);
      lod.add(child);
    }

    // Replace the original node in the parent with the LOD object
    parent.remove(node);
    parent.add(lod);

    // Explicitly initialize visibility: only the closest level visible
    for (let i = 0; i < lod.levels.length; i++) {
      lod.levels[i].object.visible = (i === 0);
    }

    // Calculate cull distance from the lowest-detail LOD level's bounding sphere.
    // This is computed once at load time and stored on userData so the per-frame
    // update never needs to recompute it.
    const lowestLevel = lod.levels[lod.levels.length - 1].object;
    const box = new THREE.Box3().setFromObject(lowestLevel);
    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);
    // Hide when camera is more than 150× the object's bounding radius away.
    lod.userData.cullDistance = sphere.radius * 150;

    lodObjects.push(lod);
  }

  return lodObjects;
}
