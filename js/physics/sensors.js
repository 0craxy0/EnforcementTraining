/**
 * High-Performance LIDAR Raycasting Sensor System for Cars
 * Heavily optimized with Spatial Hash Grid & Zero Garbage Collection
 */
import { CONFIG } from '../config.js';
import { fastIntersect } from '../track/spatialIndex.js';

export class SensorArray {
  constructor(car) {
    this.car = car;
    this.rayCount = CONFIG.SENSORS.RAY_COUNT;
    this.rayAngles = new Float32Array(CONFIG.SENSORS.RAY_ANGLES);
    this.rayLength = CONFIG.SENSORS.RAY_LENGTH;

    // Readings: normalized proximity [0..1]
    this.readings = new Float32Array(this.rayCount);

    // Pre-allocated ray geometry structures to avoid heap allocations
    this.rays = [];
    for (let i = 0; i < this.rayCount; i++) {
      this.rays.push({
        start: { x: 0, y: 0 },
        end: { x: 0, y: 0 },
        hit: { x: 0, y: 0 },
        hasHit: false,
        distance: this.rayLength,
        proximity: 0
      });
    }

    // Scratch intersection result (reused across all tests)
    this.scratchHit = { hit: false, x: 0, y: 0, dist: 0 };
  }

  /**
   * Updates sensor rays using Spatial Index for sub-millisecond raycasting
   * @param {Object|Array} trackOrSegments - Track object with spatialIndex or raw segment array
   * @param {Array<Object>} obstacles - Dynamic obstacles if any
   */
  update(trackOrSegments, obstacles = []) {
    const carAngle = this.car.angle;
    const frontDist = this.car.length * 0.5;
    const originX = this.car.x + Math.cos(carAngle) * frontDist;
    const originY = this.car.y + Math.sin(carAngle) * frontDist;

    const spatialIndex = trackOrSegments.spatialIndex || null;
    const trackSegments = trackOrSegments.wallSegments || (Array.isArray(trackOrSegments) ? trackOrSegments : null);
    const scratch = this.scratchHit;

    for (let i = 0; i < this.rayCount; i++) {
      const angle = carAngle + this.rayAngles[i];
      const endX = originX + Math.cos(angle) * this.rayLength;
      const endY = originY + Math.sin(angle) * this.rayLength;

      const ray = this.rays[i];
      ray.start.x = originX;
      ray.start.y = originY;

      let minDistance = this.rayLength;
      let hitX = endX;
      let hitY = endY;
      let hasHit = false;

      // Ray bounding box for spatial query
      const minX = originX < endX ? originX : endX;
      const maxX = originX > endX ? originX : endX;
      const minY = originY < endY ? originY : endY;
      const maxY = originY > endY ? originY : endY;

      if (spatialIndex) {
        // Fast direct raycast: 0 heap allocations, early-distance pruning
        if (spatialIndex.castRay(originX, originY, endX, endY, this.rayLength, scratch)) {
          minDistance = scratch.dist;
          hitX = scratch.x;
          hitY = scratch.y;
          hasHit = true;
        }
      } else if (trackSegments) {
        // Fallback linear test if spatial index is missing
        const len = trackSegments.length;
        for (let s = 0; s < len; s++) {
          const seg = trackSegments[s];
          if (fastIntersect(originX, originY, endX, endY, seg.a.x, seg.a.y, seg.b.x, seg.b.y, scratch)) {
            if (scratch.dist < minDistance) {
              minDistance = scratch.dist;
              hitX = scratch.x;
              hitY = scratch.y;
              hasHit = true;
            }
          }
        }
      }

      // Check dynamic obstacles if present
      const numObs = obstacles.length;
      if (numObs > 0) {
        for (let o = 0; o < numObs; o++) {
          const obsSegs = obstacles[o].getSegments();
          for (let s = 0; s < 4; s++) {
            const seg = obsSegs[s];
            if (fastIntersect(originX, originY, endX, endY, seg.a.x, seg.a.y, seg.b.x, seg.b.y, scratch)) {
              if (scratch.dist < minDistance) {
                minDistance = scratch.dist;
                hitX = scratch.x;
                hitY = scratch.y;
                hasHit = true;
              }
            }
          }
        }
      }

      // Update cached ray data (zero allocation)
      if (hasHit) {
        const proximity = 1.0 - (minDistance / this.rayLength);
        this.readings[i] = proximity;
        ray.end.x = hitX;
        ray.end.y = hitY;
        ray.hit.x = hitX;
        ray.hit.y = hitY;
        ray.hasHit = true;
        ray.distance = minDistance;
        ray.proximity = proximity;
      } else {
        this.readings[i] = 0.0;
        ray.end.x = endX;
        ray.end.y = endY;
        ray.hasHit = false;
        ray.distance = this.rayLength;
        ray.proximity = 0.0;
      }
    }
  }
}
