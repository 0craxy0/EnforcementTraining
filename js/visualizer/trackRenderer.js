/**
 * High-Performance High-DPI Track, Circuit & World Canvas Renderer
 * Heavily optimized with Offscreen Canvas Caching, Batching & Frustum Culling
 */
import { CONFIG } from '../config.js';

export class TrackRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // Camera state
    this.camera = {
      x: 600,
      y: 450,
      zoom: 1.0,
      targetZoom: 1.0,
      mode: 'overview', // 'overview' | 'followLeader' | 'followHuman' | 'free'
      isDragging: false,
      dragStart: { x: 0, y: 0 }
    };

    // Render toggles
    this.showSensors = 'leader'; // 'all' | 'leader' | 'none'
    this.showCheckpoints = true;
    this.showCurbs = true;

    this.theme = CONFIG.THEMES.SHADCN_ZINC || CONFIG.THEMES.CYBERPUNK;

    // Offscreen Track Cache (Pre-rendered static track geometry)
    this.trackCache = null;
    this.cacheOriginX = 0;
    this.cacheOriginY = 0;
    this.cachedTrackRef = null;

    this.setupInteractions();
  }

  /**
   * Bind mouse drag and wheel zoom events
   */
  setupInteractions() {
    this.canvas.addEventListener('mousedown', (e) => {
      this.camera.isDragging = true;
      this.camera.dragStart = { x: e.clientX, y: e.clientY };
      this.camera.mode = 'free';
    });

    window.addEventListener('mousemove', (e) => {
      if (this.camera.isDragging) {
        const dx = (e.clientX - this.camera.dragStart.x) / this.camera.zoom;
        const dy = (e.clientY - this.camera.dragStart.y) / this.camera.zoom;
        this.camera.x -= dx;
        this.camera.y -= dy;
        this.camera.dragStart = { x: e.clientX, y: e.clientY };
      }
    });

    window.addEventListener('mouseup', () => {
      this.camera.isDragging = false;
    });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.12 : 0.88;
      this.camera.targetZoom = Math.max(0.3, Math.min(3.0, this.camera.targetZoom * zoomFactor));
      this.camera.mode = 'free';
    }, { passive: false });
  }

  /**
   * Adjust camera to fit entire track bounds in view
   */
  fitToTrack(track) {
    if (!track || !track.bounds) return;
    const b = track.bounds;
    const padding = 120;
    const availableW = this.canvas.width - padding * 2;
    const availableH = this.canvas.height - padding * 2;

    const scaleX = availableW / b.width;
    const scaleY = availableH / b.height;
    const bestScale = Math.min(scaleX, scaleY, 1.25);

    this.camera.x = (b.minX + b.maxX) * 0.5;
    this.camera.y = (b.minY + b.maxY) * 0.5;
    this.camera.zoom = bestScale;
    this.camera.targetZoom = bestScale;
    this.camera.mode = 'overview';

    // Invalidate track cache if bounds changed
    if (this.cachedTrackRef !== track) {
      this.buildTrackCache(track);
    }
  }

  /**
   * Pre-renders the entire static track surface into an Offscreen Canvas
   * Eliminates thousands of vector stroke, fill, and shadowBlur operations per frame!
   */
  buildTrackCache(track) {
    if (!track || !track.bounds) return;
    this.cachedTrackRef = track;

    const b = track.bounds;
    const padding = 150;
    const width = Math.ceil(b.width + padding * 2);
    const height = Math.ceil(b.height + padding * 2);

    this.cacheOriginX = b.minX - padding;
    this.cacheOriginY = b.minY - padding;

    // Create or reuse offscreen canvas
    if (!this.trackCache) {
      this.trackCache = document.createElement('canvas');
    }
    this.trackCache.width = width;
    this.trackCache.height = height;

    const ctx = this.trackCache.getContext('2d');
    ctx.clearRect(0, 0, width, height);

    ctx.save();
    ctx.translate(-this.cacheOriginX, -this.cacheOriginY);

    // 1. Draw subtle grid behind track
    this.drawCachedGrid(ctx, b, padding);

    // 2. Draw Track Surface & Curbs
    this.drawTrackSurface(ctx, track);

    // 3. Draw Checkpoints
    if (this.showCheckpoints) {
      this.drawCheckpoints(ctx, track);
    }

    // 4. Draw Start/Finish Line
    this.drawStartFinishLine(ctx, track);

    ctx.restore();
  }

  /**
   * Update camera interpolation
   */
  updateCamera(targetCar = null, track = null) {
    this.camera.zoom += (this.camera.targetZoom - this.camera.zoom) * 0.1;

    if (this.camera.mode === 'overview' && track) {
      const b = track.bounds;
      const targetX = (b.minX + b.maxX) * 0.5;
      const targetY = (b.minY + b.maxY) * 0.5;
      this.camera.x += (targetX - this.camera.x) * 0.08;
      this.camera.y += (targetY - this.camera.y) * 0.08;
    } else if ((this.camera.mode === 'followLeader' || this.camera.mode === 'followHuman') && targetCar && targetCar.isAlive) {
      const targetX = targetCar.x + Math.cos(targetCar.angle) * 40;
      const targetY = targetCar.y + Math.sin(targetCar.angle) * 40;
      this.camera.x += (targetX - this.camera.x) * 0.1;
      this.camera.y += (targetY - this.camera.y) * 0.1;
      this.camera.targetZoom = 1.35;
    }
  }

  /**
   * High-Performance Main render frame
   */
  render(track, cars, particles, obstacles = [], leaderCar = null, humanCar = null) {
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    // Clear background
    ctx.fillStyle = this.theme.background;
    ctx.fillRect(0, 0, width, height);

    // Apply Camera transform
    ctx.save();
    ctx.translate(width * 0.5, height * 0.5);
    ctx.scale(this.camera.zoom, this.camera.zoom);
    ctx.translate(-this.camera.x, -this.camera.y);

    // View Frustum Culling bounds
    const halfViewW = (width * 0.5) / this.camera.zoom + 60;
    const halfViewH = (height * 0.5) / this.camera.zoom + 60;
    const viewMinX = this.camera.x - halfViewW;
    const viewMaxX = this.camera.x + halfViewW;
    const viewMinY = this.camera.y - halfViewH;
    const viewMaxY = this.camera.y + halfViewH;

    // 1. Draw Pre-rendered Track Surface (Single Blit!)
    if (!this.trackCache || this.cachedTrackRef !== track) {
      this.buildTrackCache(track);
    }
    if (this.trackCache) {
      ctx.drawImage(this.trackCache, this.cacheOriginX, this.cacheOriginY);
    }

    // 2. Draw Skid Marks
    particles.drawSkidMarks(ctx);

    // 3. Draw Dynamic Obstacles
    const numObs = obstacles.length;
    for (let i = 0; i < numObs; i++) {
      obstacles[i].draw(ctx);
    }

    // 4. Draw Crashed Cars first (frustum culled)
    const numCars = cars.length;
    for (let i = 0; i < numCars; i++) {
      const car = cars[i];
      if (!car.isAlive && car !== leaderCar) {
        if (car.x >= viewMinX && car.x <= viewMaxX && car.y >= viewMinY && car.y <= viewMaxY) {
          car.draw(ctx, { showRays: false, isFocused: false });
        }
      }
    }

    // 5. Draw Alive AI Cars (frustum culled)
    const showAllRays = (this.showSensors === 'all');
    for (let i = 0; i < numCars; i++) {
      const car = cars[i];
      if (car.isAlive && car !== leaderCar) {
        if (car.x >= viewMinX && car.x <= viewMaxX && car.y >= viewMinY && car.y <= viewMaxY) {
          car.draw(ctx, { showRays: showAllRays, isFocused: false });
        }
      }
    }

    // 6. Draw Human Player Car
    if (humanCar) {
      humanCar.draw(ctx, { showRays: true, isFocused: true });
    }

    // 7. Draw Leader Car on Top with full highlights
    if (leaderCar) {
      const showLeaderRays = (this.showSensors === 'all' || this.showSensors === 'leader');
      leaderCar.draw(ctx, { showRays: showLeaderRays, isFocused: true });
    }

    // 8. Draw Dynamic Particles (sparks, smoke, confetti)
    particles.draw(ctx);

    ctx.restore();
  }

  /**
   * Draw static background grid into the offscreen cache
   */
  drawCachedGrid(ctx, b, padding) {
    const gridSize = 60;
    const startX = Math.floor((b.minX - padding) / gridSize) * gridSize;
    const endX = Math.ceil((b.maxX + padding) / gridSize) * gridSize;
    const startY = Math.floor((b.minY - padding) / gridSize) * gridSize;
    const endY = Math.ceil((b.maxY + padding) / gridSize) * gridSize;

    ctx.save();
    ctx.strokeStyle = this.theme.gridColor;
    ctx.lineWidth = 1;

    ctx.beginPath();
    for (let x = startX; x <= endX; x += gridSize) {
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
    }
    for (let y = startY; y <= endY; y += gridSize) {
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Draw asphalt track ribbon with curbs and neon glowing barriers
   */
  drawTrackSurface(ctx, track) {
    if (!track || !track.innerPoints || !track.outerPoints) return;

    const inner = track.innerPoints;
    const outer = track.outerPoints;
    const n = inner.length;

    ctx.save();

    // 1. Draw Asphalt Base Ribbon
    ctx.beginPath();
    ctx.moveTo(outer[0].x, outer[0].y);
    for (let i = 1; i < n; i++) {
      ctx.lineTo(outer[i].x, outer[i].y);
    }
    ctx.closePath();

    ctx.moveTo(inner[0].x, inner[0].y);
    for (let i = n - 1; i >= 0; i--) {
      ctx.lineTo(inner[i].x, inner[i].y);
    }
    ctx.closePath();

    ctx.fillStyle = this.theme.asphalt;
    ctx.fill('evenodd');

    // 2. Asphalt Texture / Edge Shading
    ctx.strokeStyle = this.theme.asphaltEdge;
    ctx.lineWidth = 3;
    ctx.stroke();

    // 3. Red & White Apex Rumble Strips (Curbs)
    if (this.showCurbs) {
      this.drawRumbleStrips(ctx, inner, outer);
    }

    // 4. Centerline Racing Groove
    ctx.beginPath();
    for (let i = 0; i < track.centerPoints.length; i++) {
      const pt = track.centerPoints[i];
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    }
    ctx.closePath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 2;
    ctx.setLineDash([12, 16]);
    ctx.stroke();
    ctx.setLineDash([]);

    // 5. Crisp Clean Track Barriers (Drawn once into cache!)
    ctx.save();
    ctx.shadowColor = this.theme.barrierGlow || this.theme.barrier;
    ctx.shadowBlur = 4;
    ctx.strokeStyle = this.theme.barrier;
    ctx.lineWidth = 2.5;

    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      if (i === 0) ctx.moveTo(inner[i].x, inner[i].y);
      else ctx.lineTo(inner[i].x, inner[i].y);
    }
    ctx.closePath();
    ctx.stroke();

    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      if (i === 0) ctx.moveTo(outer[i].x, outer[i].y);
      else ctx.lineTo(outer[i].x, outer[i].y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }

  /**
   * Draw alternating red and white rumble strips (curbs) on track edges
   */
  drawRumbleStrips(ctx, inner, outer) {
    ctx.save();
    for (let i = 0; i < inner.length; i += 2) {
      const nextIdx = (i + 1) % inner.length;
      const isRed = (Math.floor(i / 2) % 2 === 0);
      const curbColor = isRed ? this.theme.curbRed : this.theme.curbWhite;

      ctx.strokeStyle = curbColor;
      ctx.lineWidth = 4;

      ctx.beginPath();
      ctx.moveTo(inner[i].x, inner[i].y);
      ctx.lineTo(inner[nextIdx].x, inner[nextIdx].y);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(outer[i].x, outer[i].y);
      ctx.lineTo(outer[nextIdx].x, outer[nextIdx].y);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Draw checkpoint lines
   */
  drawCheckpoints(ctx, track) {
    if (!track.checkpoints) return;

    ctx.save();
    ctx.strokeStyle = this.theme.checkpoint;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 6]);

    for (let i = 1; i < track.checkpoints.length; i++) {
      const cp = track.checkpoints[i];
      ctx.beginPath();
      ctx.moveTo(cp.a.x, cp.a.y);
      ctx.lineTo(cp.b.x, cp.b.y);
      ctx.stroke();
    }

    ctx.setLineDash([]);
    ctx.restore();
  }

  /**
   * Draw checkered start / finish line
   */
  drawStartFinishLine(ctx, track) {
    const cp = track.startLine;
    if (!cp) return;

    const ax = cp.a.x, ay = cp.a.y;
    const bx = cp.b.x, by = cp.b.y;
    const dist = Math.hypot(bx - ax, by - ay);
    const steps = Math.floor(dist / 8);

    ctx.save();
    const tangent = track.tangents[0];
    const thickness = 10;

    for (let s = 0; s < steps; s++) {
      const t1 = s / steps;
      const t2 = (s + 1) / steps;

      const p1x = ax + (bx - ax) * t1;
      const p1y = ay + (by - ay) * t1;
      const p2x = ax + (bx - ax) * t2;
      const p2y = ay + (by - ay) * t2;

      const isBlack1 = (s % 2 === 0);
      ctx.fillStyle = isBlack1 ? '#ffffff' : '#111827';
      ctx.beginPath();
      ctx.moveTo(p1x, p1y);
      ctx.lineTo(p2x, p2y);
      ctx.lineTo(p2x + tangent.x * (thickness * 0.5), p2y + tangent.y * (thickness * 0.5));
      ctx.lineTo(p1x + tangent.x * (thickness * 0.5), p1y + tangent.y * (thickness * 0.5));
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = isBlack1 ? '#111827' : '#ffffff';
      ctx.beginPath();
      ctx.moveTo(p1x + tangent.x * (thickness * 0.5), p1y + tangent.y * (thickness * 0.5));
      ctx.lineTo(p2x + tangent.x * (thickness * 0.5), p2y + tangent.y * (thickness * 0.5));
      ctx.lineTo(p2x + tangent.x * thickness, p2y + tangent.y * thickness);
      ctx.lineTo(p1x + tangent.x * thickness, p1y + tangent.y * thickness);
      ctx.closePath();
      ctx.fill();
    }

    // Crisp finish line edges
    ctx.strokeStyle = this.theme.finishLine;
    ctx.shadowColor = this.theme.barrierGlow || this.theme.finishLine;
    ctx.shadowBlur = 4;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();

    ctx.restore();
  }
}
