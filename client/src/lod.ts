import * as THREE from 'three';

/**
 * Hysteresis ratio (0-1) to prevent LOD flickering at boundaries. 0.1 = 10% band.
 */
const LOD_HYSTERESIS = 0.1;

/**
 * Fallback distance thresholds for legacy `_LOD_XX` (index-based) naming.
 * Used when a GLB hasn't been updated to the new `_LOD_<meters>m` convention.
 */
const LEGACY_LOD_DISTANCES: readonly number[] = [0, 30, 60, 100];

/**
 * New naming convention: "_LOD_<distance>m" where distance is in meters.
 *
 *   "wall_panel_LOD_25m"   → baseName="wall_panel", distance=25
 *   "wall_panel_LOD_25m_1" → same (Three.js dedup suffix)
 *
 * Captures: [1] = base name, [2] = distance in meters
 */
const LOD_DISTANCE_REGEX = /^(.+)_LOD_(\d+)m(?:_\d+)?$/;

/**
 * Legacy naming convention: "_LOD_XX" where XX is a 2-digit index.
 *
 *   "batteries_LOD_00"   → baseName="batteries", index=0
 *   "batteries_LOD_00_1" → same (Three.js dedup suffix)
 *
 * Captures: [1] = base name, [2] = LOD index (00–99)
 */
const LOD_INDEX_REGEX = /^(.+)_LOD_(\d{2})(?:_\d+)?$/;

/**
 * Tests whether a node name matches either LOD naming convention.
 */
function isLODName(name: string): boolean {
  return LOD_DISTANCE_REGEX.test(name) || LOD_INDEX_REGEX.test(name);
}

interface ParsedLOD {
  baseName: string;
  /** Resolved distance in meters. */
  distance: number;
  /** Original sort key — distance for meter-based, index for legacy. */
  sortKey: number;
}

/**
 * Parses LOD info from a node name. Tries the meter-based convention first,
 * then falls back to the legacy index-based convention.
 */
function parseLOD(name: string): ParsedLOD | null {
  // Try new distance-in-meters convention first
  const distMatch = name.match(LOD_DISTANCE_REGEX);
  if (distMatch) {
    const distance = parseInt(distMatch[2], 10);
    return { baseName: distMatch[1], distance, sortKey: distance };
  }

  // Fall back to legacy index convention
  const idxMatch = name.match(LOD_INDEX_REGEX);
  if (idxMatch) {
    const index = parseInt(idxMatch[2], 10);
    const distance = LEGACY_LOD_DISTANCES[index] ?? LEGACY_LOD_DISTANCES[LEGACY_LOD_DISTANCES.length - 1];
    return { baseName: idxMatch[1], distance, sortKey: index };
  }

  return null;
}

/**
 * Traverses a cloned GLB scene graph and converts Blender collection-instance
 * LOD hierarchies into Three.js LOD objects.
 *
 * Supports two structural patterns:
 *
 * 1. **Collection-instance pattern** (e.g. interior objects):
 *    The LOD meshes are nested under an empty that is itself a child of a
 *    collection-instance node:
 *
 *      "wall_panel.002" (Object3D)        ← collection instance
 *        └── "wall_panel" (Object3D)      ← empty
 *              ├── "wall_panel_LOD_0m"    (Mesh)
 *              ├── "wall_panel_LOD_25m"   (Mesh)
 *              ├── "wall_panel_LOD_50m"   (Mesh)
 *              └── "wall_panel_LOD_80m"   (Mesh)
 *
 * 2. **Flat sibling pattern** (e.g. exterior hull):
 *    Multiple LOD meshes sharing the same base name sit as siblings under
 *    the same parent (often the scene root):
 *
 *      Scene root
 *        ├── "ascendancy_LOD_0m"    (Mesh)
 *        ├── "ascendancy_LOD_300m"  (Mesh)
 *        ├── "ascendancy_LOD_600m"  (Mesh)
 *        └── "ascendancy_LOD_1200m" (Mesh)
 *
 * The distance for each LOD level is extracted from the name itself
 * (`_LOD_<meters>m`), so the number of LOD levels per object can vary freely.
 *
 * Non-LOD objects are left untouched.
 *
 * @param scene  The cloned GLB scene root to process in-place.
 * @returns Array of all THREE.LOD objects created (caller must call
 *          `lod.update(camera)` each frame).
 */
export function setupLODs(scene: THREE.Object3D): THREE.LOD[] {
  const lodObjects: THREE.LOD[] = [];

  // ── Pass 1: Collection-instance pattern ────────────────────────────────
  // Collect candidates first to avoid mutating the tree during traversal.
  const collectionCandidates: {
    parent: THREE.Object3D;
    node: THREE.Object3D;
    empty: THREE.Object3D;
  }[] = [];

  scene.traverse((node) => {
    // Structural pattern: node with exactly 1 child (the "empty"),
    // whose children contain LOD-named meshes/groups.
    if (node.children.length !== 1) return;

    const empty = node.children[0];
    if (empty.children.length < 2) return;

    const lodChildren = empty.children.filter((child) => isLODName(child.name));
    if (lodChildren.length < 2) return;

    if (node.parent) {
      collectionCandidates.push({ parent: node.parent, node, empty });
    }
  });

  for (const { parent, node, empty } of collectionCandidates) {
    const lod = buildLODFromChildren(empty, node.name + '_LOD');

    // Preserve the original transform of the collection instance node
    lod.position.copy(node.position);
    lod.quaternion.copy(node.quaternion);
    lod.scale.copy(node.scale);

    // Check if the empty has a non-identity transform that needs to be preserved
    const hasEmptyTransform =
      empty.position.lengthSq() > 1e-8 ||
      empty.quaternion.x !== 0 ||
      empty.quaternion.y !== 0 ||
      empty.quaternion.z !== 0 ||
      Math.abs(empty.scale.x - 1) > 1e-6 ||
      Math.abs(empty.scale.y - 1) > 1e-6 ||
      Math.abs(empty.scale.z - 1) > 1e-6;

    // Separate LOD and non-LOD children
    const lodMeshes: { distance: number; mesh: THREE.Object3D }[] = [];
    const nonLodChildren: THREE.Object3D[] = [];

    for (const child of [...empty.children]) {
      const parsed = parseLOD(child.name);
      if (parsed) {
        lodMeshes.push({ distance: parsed.distance, mesh: child });
      } else {
        nonLodChildren.push(child);
      }
    }

    // Sort by distance ascending (closest / highest detail first)
    lodMeshes.sort((a, b) => a.distance - b.distance);

    for (const { distance, mesh } of lodMeshes) {
      empty.remove(mesh);
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

    // Non-LOD children stay visible at all distances
    for (const child of nonLodChildren) {
      empty.remove(child);
      lod.add(child);
    }

    // Replace the original node in the parent
    parent.remove(node);
    parent.add(lod);

    finalizeLOD(lod);
    lodObjects.push(lod);
  }

  // ── Pass 2: Flat sibling pattern ───────────────────────────────────────
  // Group scene-root children (or any parent's children) that share the same
  // base name and match the LOD naming convention.
  const processedNodes = new Set<THREE.Object3D>();
  const siblingGroups = findSiblingLODGroups(scene, processedNodes);

  for (const { parent, baseName, members } of siblingGroups) {
    const lod = new THREE.LOD();
    lod.name = baseName + '_LOD';

    // Sort by distance ascending
    members.sort((a, b) => a.distance - b.distance);

    // Use the position/quaternion/scale of the first member (should all match for
    // flat LOD siblings — they represent the same object).
    const firstMember = members[0].mesh;
    lod.position.copy(firstMember.position);
    lod.quaternion.copy(firstMember.quaternion);
    lod.scale.copy(firstMember.scale);

    for (const { distance, mesh } of members) {
      parent.remove(mesh);
      // Reset the position since the LOD parent carries the transform
      mesh.position.set(0, 0, 0);
      mesh.quaternion.identity();
      mesh.scale.set(1, 1, 1);
      lod.addLevel(mesh, distance, LOD_HYSTERESIS);
    }

    parent.add(lod);

    finalizeLOD(lod);
    lodObjects.push(lod);
  }

  return lodObjects;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Finds groups of sibling nodes (direct children of the same parent) that
 * share a base LOD name, indicating they are flat LOD variants of the same
 * object.
 */
function findSiblingLODGroups(
  scene: THREE.Object3D,
  processedNodes: Set<THREE.Object3D>,
): { parent: THREE.Object3D; baseName: string; members: { distance: number; mesh: THREE.Object3D }[] }[] {
  const results: {
    parent: THREE.Object3D;
    baseName: string;
    members: { distance: number; mesh: THREE.Object3D }[];
  }[] = [];

  // We check every node's direct children for siblings sharing a base name.
  // To avoid duplicates, we track which parents we've processed.
  const visitedParents = new Set<THREE.Object3D>();

  const nodesToVisit: THREE.Object3D[] = [scene];
  while (nodesToVisit.length > 0) {
    const current = nodesToVisit.pop()!;

    if (!visitedParents.has(current) && current.children.length >= 2) {
      visitedParents.add(current);

      // Group children by LOD base name
      const groups = new Map<string, { distance: number; mesh: THREE.Object3D }[]>();

      for (const child of current.children) {
        if (processedNodes.has(child)) continue;

        const parsed = parseLOD(child.name);
        if (parsed) {
          let group = groups.get(parsed.baseName);
          if (!group) {
            group = [];
            groups.set(parsed.baseName, group);
          }
          group.push({ distance: parsed.distance, mesh: child });
        }
      }

      for (const [baseName, members] of groups) {
        if (members.length >= 2) {
          results.push({ parent: current, baseName, members });
          for (const m of members) processedNodes.add(m.mesh);
        }
      }
    }

    for (const child of current.children) {
      if (!processedNodes.has(child)) {
        nodesToVisit.push(child);
      }
    }
  }

  return results;
}

/**
 * Creates a bare THREE.LOD object from the children of an "empty" node.
 * (Used by the collection-instance pattern.)
 */
function buildLODFromChildren(empty: THREE.Object3D, lodName: string): THREE.LOD {
  const lod = new THREE.LOD();
  lod.name = lodName;
  return lod;
}

/**
 * Final setup common to every LOD: initial visibility and cull distance.
 */
function finalizeLOD(lod: THREE.LOD): void {
  // Initialize visibility: only the closest level visible
  for (let i = 0; i < lod.levels.length; i++) {
    lod.levels[i].object.visible = i === 0;
  }

  // Compute a cull distance from the lowest-detail LOD's bounding sphere.
  const lowestLevel = lod.levels[lod.levels.length - 1];
  if (lowestLevel) {
    const box = new THREE.Box3().setFromObject(lowestLevel.object);
    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);
    // Hide when camera is more than 150× the bounding radius away.
    lod.userData.cullDistance = sphere.radius * 150;
  }
}
