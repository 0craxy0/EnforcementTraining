/**
 * Spline Track Generator, Boundary Offset Calculator & Checkpoint System
 */
import { SpatialSegmentIndex } from './spatialIndex.js';

export class TrackBuilder {
  /**
   * Builds complete track geometry from an array of 2D control points
   * @param {Array<{x: number, y: number, width?: number}>} controlPoints
   * @param {number} defaultWidth - Track width in pixels
   * @param {number} samplesPerSegment - Resolution of spline interpolation
   * @param {number} checkpointSpacing - Distance in pixels between checkpoints
   */
  static buildTrack(controlPoints, defaultWidth = 85, samplesPerSegment = 24, checkpointSpacing = 65) {
    if (controlPoints.length < 3) {
      throw new Error("Track requires at least 3 control points");
    }

    const n = controlPoints.length;
    const centerPoints = [];

    // 1. Generate closed Catmull-Rom spline
    for (let i = 0; i < n; i++) {
      const p0 = controlPoints[(i - 1 + n) % n];
      const p1 = controlPoints[i];
      const p2 = controlPoints[(i + 1) % n];
      const p3 = controlPoints[(i + 2) % n];

      const w1 = p1.width || defaultWidth;
      const w2 = p2.width || defaultWidth;

      for (let s = 0; s < samplesPerSegment; s++) {
        const t = s / samplesPerSegment;
        const pt = this.catmullRom(p0, p1, p2, p3, t);
        const width = w1 + (w2 - w1) * t;
        centerPoints.push({ x: pt.x, y: pt.y, width });
      }
    }

    // 2. Compute tangents, normals, inner & outer boundaries
    const totalPoints = centerPoints.length;
    const innerPoints = [];
    const outerPoints = [];
    const tangents = [];
    const normals = [];

    for (let i = 0; i < totalPoints; i++) {
      const prev = centerPoints[(i - 1 + totalPoints) % totalPoints];
      const curr = centerPoints[i];
      const next = centerPoints[(i + 1) % totalPoints];

      // Tangent vector
      let dx = next.x - prev.x;
      let dy = next.y - prev.y;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
      tangents.push({ x: dx, y: dy });

      // Normal vector (perpendicular pointing left)
      const nx = -dy;
      const ny = dx;
      normals.push({ x: nx, y: ny });

      const halfW = curr.width * 0.5;

      // Inner boundary (left)
      innerPoints.push({
        x: curr.x + nx * halfW,
        y: curr.y + ny * halfW
      });

      // Outer boundary (right)
      outerPoints.push({
        x: curr.x - nx * halfW,
        y: curr.y - ny * halfW
      });
    }

    // 3. Build line segments for collision & raycasting
    const innerSegments = [];
    const outerSegments = [];

    for (let i = 0; i < totalPoints; i++) {
      const nextIdx = (i + 1) % totalPoints;
      innerSegments.push({
        a: innerPoints[i],
        b: innerPoints[nextIdx]
      });
      outerSegments.push({
        a: outerPoints[i],
        b: outerPoints[nextIdx]
      });
    }

    const wallSegments = [...innerSegments, ...outerSegments];

    // 4. Generate Checkpoints along the track
    const checkpoints = [];
    let accumulatedDist = 0;

    // Checkpoint 0 is Start / Finish line
    checkpoints.push({
      index: 0,
      a: innerPoints[0],
      b: outerPoints[0],
      center: centerPoints[0],
      normal: tangents[0], // Car must cross along tangent direction
      isFinishLine: true
    });

    for (let i = 1; i < totalPoints; i++) {
      const prev = centerPoints[i - 1];
      const curr = centerPoints[i];
      accumulatedDist += Math.hypot(curr.x - prev.x, curr.y - prev.y);

      if (accumulatedDist >= checkpointSpacing) {
        // Ensure not too close to the last checkpoint or start line
        const distToStart = Math.hypot(curr.x - centerPoints[0].x, curr.y - centerPoints[0].y);
        if (distToStart > checkpointSpacing * 0.8) {
          checkpoints.push({
            index: checkpoints.length,
            a: innerPoints[i],
            b: outerPoints[i],
            center: curr,
            normal: tangents[i],
            isFinishLine: false
          });
          accumulatedDist = 0;
        }
      }
    }

    // 5. Compute Track Bounding Box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < totalPoints; i++) {
      minX = Math.min(minX, innerPoints[i].x, outerPoints[i].x);
      minY = Math.min(minY, innerPoints[i].y, outerPoints[i].y);
      maxX = Math.max(maxX, innerPoints[i].x, outerPoints[i].x);
      maxY = Math.max(maxY, innerPoints[i].y, outerPoints[i].y);
    }

    // 6. Build High-Performance Spatial Index for Fast Raycasting & Collisions
    const spatialIndex = new SpatialSegmentIndex(90);
    spatialIndex.build(wallSegments);

    return {
      controlPoints,
      centerPoints,
      innerPoints,
      outerPoints,
      tangents,
      normals,
      innerSegments,
      outerSegments,
      wallSegments,
      spatialIndex,
      checkpoints,
      bounds: { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY },
      startLine: checkpoints[0],
      startAngle: Math.atan2(tangents[0].y, tangents[0].x)
    };
  }

  /**
   * Catmull-Rom spline formula
   */
  static catmullRom(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const t3 = t2 * t;

    const f1 = -0.5 * t3 + t2 - 0.5 * t;
    const f2 = 1.5 * t3 - 2.5 * t2 + 1.0;
    const f3 = -1.5 * t3 + 2.0 * t2 + 0.5 * t;
    const f4 = 0.5 * t3 - 0.5 * t2;

    return {
      x: p0.x * f1 + p1.x * f2 + p2.x * f3 + p3.x * f4,
      y: p0.y * f1 + p1.y * f2 + p2.y * f3 + p3.y * f4
    };
  }

  /**
   * Generates grid starting positions for cars behind the start line
   * @param {Object} track
   * @param {number} count
   */
  static getStartingGrid(track, count) {
    const startCp = track.startLine;
    const startAngle = track.startAngle;
    const center = startCp.center;
    const tangent = track.tangents[0];
    const normal = track.normals[0];

    const positions = [];
    const rows = Math.ceil(count / 2);
    const rowSpacing = 28; // Spacing along track backwards
    const colSpacing = 22; // Lateral spacing between grid columns

    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / 2);
      const col = (i % 2 === 0) ? -1 : 1; // Left or Right column

      // Backwards offset behind start line
      const backDist = 30 + row * rowSpacing;
      const sideDist = col * colSpacing * 0.5;

      const x = center.x - tangent.x * backDist + normal.x * sideDist;
      const y = center.y - tangent.y * backDist + normal.y * sideDist;

      positions.push({ x, y, angle: startAngle });
    }

    return positions;
  }
}
