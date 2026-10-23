/**
 * High-Performance 2D Spatial Grid for Ultra-Fast Segment Intersection & Collision
 * Features flat 1D dense array indexing, zero-allocation direct raycasting, and inlined polygon collision
 */
export class SpatialSegmentIndex {
  constructor(cellSize = 90) {
    this.cellSize = cellSize;
    this.invCellSize = 1 / cellSize;
    this.cells = new Map();
    this.grid = null;
    this.originX = 0;
    this.originY = 0;
    this.cols = 0;
    this.rows = 0;
    this.queryId = 1;
    this.visited = new Uint32Array(2048);
    this.totalSegments = 0;
  }

  /**
   * Index an array of line segments into the spatial grid
   * @param {Array<{id?: number, a: {x: number, y: number}, b: {x: number, y: number}}>} segments
   * @param {Object} [bounds] - Optional circuit bounds for flat 1D array indexing
   */
  build(segments, bounds = null) {
    this.totalSegments = segments.length;
    this.cells.clear();

    if (this.visited.length < segments.length) {
      this.visited = new Uint32Array(segments.length + 512);
    }
    this.visited.fill(0);
    this.queryId = 1;

    if (bounds) {
      const pad = this.cellSize;
      this.originX = bounds.minX - pad;
      this.originY = bounds.minY - pad;
      this.cols = Math.ceil((bounds.maxX + pad - this.originX) * this.invCellSize) + 2;
      this.rows = Math.ceil((bounds.maxY + pad - this.originY) * this.invCellSize) + 2;
      const totalCells = this.cols * this.rows;
      this.grid = new Array(totalCells);
      for (let i = 0; i < totalCells; i++) {
        this.grid[i] = [];
      }
    } else {
      this.grid = null;
    }

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      seg.id = i;

      const ax = seg.a.x, ay = seg.a.y;
      const bx = seg.b.x, by = seg.b.y;

      const minX = ax < bx ? ax : bx;
      const maxX = ax > bx ? ax : bx;
      const minY = ay < by ? ay : by;
      const maxY = ay > by ? ay : by;

      if (this.grid) {
        const startCx = Math.max(0, Math.floor((minX - this.originX) * this.invCellSize));
        const endCx = Math.min(this.cols - 1, Math.floor((maxX - this.originX) * this.invCellSize));
        const startCy = Math.max(0, Math.floor((minY - this.originY) * this.invCellSize));
        const endCy = Math.min(this.rows - 1, Math.floor((maxY - this.originY) * this.invCellSize));

        for (let cy = startCy; cy <= endCy; cy++) {
          const rowOffset = cy * this.cols;
          for (let cx = startCx; cx <= endCx; cx++) {
            this.grid[rowOffset + cx].push(seg);
          }
        }
      } else {
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
  }

  /**
   * High-Speed Direct Raycast with Zero Closures & Early Distance Pruning
   * @param {number} x1 - Ray start x
   * @param {number} y1 - Ray start y
   * @param {number} x2 - Ray end x
   * @param {number} y2 - Ray end y
   * @param {number} rayLength - Full length of ray
   * @param {Object} out - Reusable output hit object { hit, x, y, dist }
   * @returns {boolean} True if hit
   */
  castRay(x1, y1, x2, y2, rayLength, out) {
    out.hit = false;
    out.dist = rayLength;
    out.x = x2;
    out.y = y2;

    const rX = x2 - x1;
    const rY = y2 - y1;

    const minX = x1 < x2 ? x1 : x2;
    const maxX = x1 > x2 ? x1 : x2;
    const minY = y1 < y2 ? y1 : y2;
    const maxY = y1 > y2 ? y1 : y2;

    if (++this.queryId >= 4294967200) {
      this.visited.fill(0);
      this.queryId = 1;
    }
    const qId = this.queryId;

    let minT = 1.0;

    if (this.grid) {
      const startCx = Math.max(0, Math.floor((minX - this.originX) * this.invCellSize));
      const endCx = Math.min(this.cols - 1, Math.floor((maxX - this.originX) * this.invCellSize));
      const startCy = Math.max(0, Math.floor((minY - this.originY) * this.invCellSize));
      const endCy = Math.min(this.rows - 1, Math.floor((maxY - this.originY) * this.invCellSize));

      for (let cy = startCy; cy <= endCy; cy++) {
        const rowOffset = cy * this.cols;
        for (let cx = startCx; cx <= endCx; cx++) {
          const cell = this.grid[rowOffset + cx];
          const len = cell.length;
          for (let i = 0; i < len; i++) {
            const seg = cell[i];
            if (this.visited[seg.id] !== qId) {
              this.visited[seg.id] = qId;

              const sX = seg.dx;
              const sY = seg.dy;
              const denom = rX * sY - rY * sX;
              if (denom > 1e-9) {
                const uX = seg.a.x - x1;
                const uY = seg.a.y - y1;
                const numT = uX * sY - uY * sX;
                if (numT >= 0 && numT < minT * denom) {
                  const numU = uX * rY - uY * rX;
                  if (numU >= 0 && numU <= denom) {
                    minT = numT / denom;
                    out.hit = true;
                  }
                }
              } else if (denom < -1e-9) {
                const uX = seg.a.x - x1;
                const uY = seg.a.y - y1;
                const numT = uX * sY - uY * sX;
                if (numT <= 0 && numT > minT * denom) {
                  const numU = uX * rY - uY * rX;
                  if (numU <= 0 && numU >= denom) {
                    minT = numT / denom;
                    out.hit = true;
                  }
                }
              }
            }
          }
        }
      }
    } else {
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

                const sX = seg.b.x - seg.a.x;
                const sY = seg.b.y - seg.a.y;
                const denom = rX * sY - rY * sX;
                if (denom < -1e-9 || denom > 1e-9) {
                  const uX = seg.a.x - x1;
                  const uY = seg.a.y - y1;
                  const t = (uX * sY - uY * sX) / denom;
                  if (t >= 0 && t < minT) {
                    const u = (uX * rY - uY * rX) / denom;
                    if (u >= 0 && u <= 1) {
                      minT = t;
                      out.hit = true;
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    if (out.hit) {
      out.dist = minT * rayLength;
      out.x = x1 + minT * rX;
      out.y = y1 + minT * rY;
      return true;
    }
    return false;
  }

  /**
   * High-Speed Inlined Car Polygon Collision Check with Zero Closures
   * @param {Array<{x: number, y: number}>} corners - 8 chassis corners
   * @param {number} minX
   * @param {number} minY
   * @param {number} maxX
   * @param {number} maxY
   * @returns {boolean} True if collided
   */
  checkCarCollision(corners, minX, minY, maxX, maxY) {
    if (++this.queryId >= 4294967200) {
      this.visited.fill(0);
      this.queryId = 1;
    }
    const qId = this.queryId;

    if (this.grid) {
      const startCx = Math.max(0, Math.floor((minX - this.originX) * this.invCellSize));
      const endCx = Math.min(this.cols - 1, Math.floor((maxX - this.originX) * this.invCellSize));
      const startCy = Math.max(0, Math.floor((minY - this.originY) * this.invCellSize));
      const endCy = Math.min(this.rows - 1, Math.floor((maxY - this.originY) * this.invCellSize));

      for (let cy = startCy; cy <= endCy; cy++) {
        const rowOffset = cy * this.cols;
        for (let cx = startCx; cx <= endCx; cx++) {
          const cell = this.grid[rowOffset + cx];
          const len = cell.length;
          for (let i = 0; i < len; i++) {
            const seg = cell[i];
            if (this.visited[seg.id] !== qId) {
              this.visited[seg.id] = qId;

              const ax = seg.a.x, ay = seg.a.y;
              const sdx = seg.dx;
              const sdy = seg.dy;

              for (let c = 0; c < 8; c++) {
                const p1 = corners[c];
                const p2 = corners[(c + 1) % 8];

                const ccw1 = sdy * (p1.x - ax) > sdx * (p1.y - ay);
                const ccw2 = sdy * (p2.x - ax) > sdx * (p2.y - ay);
                if (ccw1 !== ccw2) {
                  const edx = p2.x - p1.x;
                  const edy = p2.y - p1.y;
                  const ccw3 = edy * (ax - p1.x) > edx * (ay - p1.y);
                  const ccw4 = edy * (ax + sdx - p1.x) > edx * (ay + sdy - p1.y);
                  if (ccw3 !== ccw4) {
                    return true;
                  }
                }
              }
            }
          }
        }
      }
    } else {
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

                const ax = seg.a.x, ay = seg.a.y;
                const bx = seg.b.x, by = seg.b.y;

                for (let c = 0; c < 8; c++) {
                  const p1 = corners[c];
                  const p2 = corners[(c + 1) % 8];

                  const ccw1 = (by - ay) * (p1.x - ax) > (bx - ax) * (p1.y - ay);
                  const ccw2 = (by - ay) * (p2.x - ax) > (bx - ax) * (p2.y - ay);
                  if (ccw1 !== ccw2) {
                    const ccw3 = (p2.y - p1.y) * (ax - p1.x) > (p2.x - p1.x) * (ay - p1.y);
                    const ccw4 = (p2.y - p1.y) * (bx - p1.x) > (p2.x - p1.x) * (by - p1.y);
                    if (ccw3 !== ccw4) {
                      return true;
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    return false;
  }

  /**
   * General query callback for compatibility
   */
  query(minX, minY, maxX, maxY, callback) {
    if (++this.queryId >= 4294967200) {
      this.visited.fill(0);
      this.queryId = 1;
    }
    const qId = this.queryId;

    if (this.grid) {
      const startCx = Math.max(0, Math.floor((minX - this.originX) * this.invCellSize));
      const endCx = Math.min(this.cols - 1, Math.floor((maxX - this.originX) * this.invCellSize));
      const startCy = Math.max(0, Math.floor((minY - this.originY) * this.invCellSize));
      const endCy = Math.min(this.rows - 1, Math.floor((maxY - this.originY) * this.invCellSize));

      for (let cy = startCy; cy <= endCy; cy++) {
        const rowOffset = cy * this.cols;
        for (let cx = startCx; cx <= endCx; cx++) {
          const cell = this.grid[rowOffset + cx];
          const len = cell.length;
          for (let i = 0; i < len; i++) {
            const seg = cell[i];
            if (this.visited[seg.id] !== qId) {
              this.visited[seg.id] = qId;
              if (callback(seg) === true) return;
            }
          }
        }
      }
    } else {
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
                if (callback(seg) === true) return;
              }
            }
          }
        }
      }
    }
  }
}

export const RAY_HIT = {
  hit: false,
  x: 0,
  y: 0,
  dist: 0
};

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
    const dx = t * rX;
    const dy = t * rY;
    out.dist = Math.sqrt(dx * dx + dy * dy);
    return true;
  }

  out.hit = false;
  return false;
}
