/**
 * High-Performance 2D Spatial Hash Grid for Ultra-Fast Segment Intersection & Collision
 */
export class SpatialSegmentIndex {
  constructor(cellSize = 90) {
    this.cellSize = cellSize;
    this.invCellSize = 1 / cellSize;
    this.cells = new Map();
    this.queryId = 1;
    this.visited = new Uint32Array(2048);
    this.totalSegments = 0;
  }

  /**
   * Index an array of line segments into the spatial grid
   * @param {Array<{id?: number, a: {x: number, y: number}, b: {x: number, y: number}}>} segments
   */
  build(segments) {
    this.cells.clear();
    this.totalSegments = segments.length;

    if (this.visited.length < segments.length) {
      this.visited = new Uint32Array(segments.length + 512);
    }
    this.visited.fill(0);
    this.queryId = 1;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      seg.id = i;

      const ax = seg.a.x, ay = seg.a.y;
      const bx = seg.b.x, by = seg.b.y;

      const minX = ax < bx ? ax : bx;
      const maxX = ax > bx ? ax : bx;
      const minY = ay < by ? ay : by;
      const maxY = ay > by ? ay : by;

      const startCx = Math.floor(minX * this.invCellSize);
      const endCx = Math.floor(maxX * this.invCellSize);
      const startCy = Math.floor(minY * this.invCellSize);
      const endCy = Math.floor(maxY * this.invCellSize);

      for (let cx = startCx; cx <= endCx; cx++) {
        for (let cy = startCy; cy <= endCy; cy++) {
          const key = (cx * 73856093) ^ (cy * 19349663);
          let cell = this.cells.get(key);
          if (!cell) {
            cell = [];
            this.cells.set(key, cell);
          }
          cell.push(seg);
        }
      }
    }
  }

  /**
   * Query all unique segments inside the specified AABB
   * Zero heap allocations: uses callback and Uint32Array visited marks
   */
  query(minX, minY, maxX, maxY, callback) {
    // Wrap queryId if it approaches 32-bit integer limit
    if (++this.queryId >= 4294967200) {
      this.visited.fill(0);
      this.queryId = 1;
    }
    const qId = this.queryId;

    const startCx = Math.floor(minX * this.invCellSize);
    const endCx = Math.floor(maxX * this.invCellSize);
    const startCy = Math.floor(minY * this.invCellSize);
    const endCy = Math.floor(maxY * this.invCellSize);

    for (let cx = startCx; cx <= endCx; cx++) {
      for (let cy = startCy; cy <= endCy; cy++) {
        const key = (cx * 73856093) ^ (cy * 19349663);
        const cell = this.cells.get(key);
        if (cell) {
          const len = cell.length;
          for (let i = 0; i < len; i++) {
            const seg = cell[i];
            if (this.visited[seg.id] !== qId) {
              this.visited[seg.id] = qId;
              if (callback(seg) === true) {
                return; // Early exit if callback signals stop
              }
            }
          }
        }
      }
    }
  }
}

// Reusable scratch object for zero-allocation ray intersections
export const RAY_HIT = {
  hit: false,
  x: 0,
  y: 0,
  dist: 0
};

/**
 * Highly optimized, zero-allocation 2D line segment intersection
 * Ray from (x1, y1) to (x2, y2), segment from (x3, y3) to (x4, y4)
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @param {number} x3
 * @param {number} y3
 * @param {number} x4
 * @param {number} y4
 * @param {Object} out - Reusable output object { hit, x, y, dist }
 * @returns {boolean}
 */
export function fastIntersect(x1, y1, x2, y2, x3, y3, x4, y4, out) {
  const rX = x2 - x1;
  const rY = y2 - y1;
  const sX = x4 - x3;
  const sY = y4 - y3;

  const denom = rX * sY - rY * sX;
  if (denom > -1e-9 && denom < 1e-9) {
    out.hit = false;
    return false;
  }

  const uX = x3 - x1;
  const uY = y3 - y1;

  const t = (uX * sY - uY * sX) / denom;
  const u = (uX * rY - uY * rX) / denom;

  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    out.hit = true;
    out.x = x1 + t * rX;
    out.y = y1 + t * rY;
    const dx = out.x - x1;
    const dy = out.y - y1;
    out.dist = Math.sqrt(dx * dx + dy * dy);
    return true;
  }

  out.hit = false;
  return false;
}
