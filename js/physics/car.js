/**
 * Car Vehicle Physics & Agent Entity
 */
import { CONFIG } from '../config.js';
import { SensorArray } from './sensors.js';
import { NeuralNetwork } from '../ai/neuralNetwork.js';

export class Car {
  constructor(id, x, y, angle, brain = null, color = null) {
    this.id = id;
    this.startX = x;
    this.startY = y;
    this.startAngle = angle;

    this.x = x;
    this.y = y;
    this.angle = angle;
    this.speed = 0;
    this.lateralVelocity = 0;
    this.angularVelocity = 0;

    this.width = CONFIG.CAR.WIDTH;
    this.length = CONFIG.CAR.LENGTH;

    // Entity state
    this.isAlive = true;
    this.isCrashed = false;
    this.crashReason = '';
    this.isHuman = false;
    this.isLeader = false;

    // Visuals
    const palette = (CONFIG.THEMES.SHADCN_ZINC || CONFIG.THEMES.CYBERPUNK).carColors;
    this.color = color || palette[id % palette.length];
    this.trail = [];
    this.skidding = false;

    // AI Brain & Sensors
    this.sensors = new SensorArray(this);
    this.brain = brain || new NeuralNetwork(
      CONFIG.NETWORK.INPUT_SIZE,
      CONFIG.NETWORK.HIDDEN_LAYERS,
      CONFIG.NETWORK.OUTPUT_SIZE
    );

    // Performance & Lap Telemetry
    this.fitness = 0;
    this.distanceTraveled = 0;
    this.checkpointsCrossed = 0;
    this.nextCheckpointIndex = 0;
    this.lapsCompleted = 0;
    this.totalFramesAlive = 0;
    this.framesSinceLastCheckpoint = 0;
    this.lapStartTime = 0;
    this.currentLapTime = 0;
    this.bestLapTime = Infinity;

    // Inputs (from brain or keyboard)
    this.controls = {
      throttle: 0, // -1 (full reverse/brake) to 1 (full throttle)
      steering: 0, // -1 (left) to 1 (right)
      drift: false
    };

    // Pre-allocated Float32Array input vector for 0-allocation neural inference
    this.inputVector = new Float32Array(CONFIG.NETWORK.INPUT_SIZE);

    // 8-Point chamfered polygon offsets matching real aerodynamic sports car chassis
    // Eliminates phantom right-angle rectangular corners that hit walls prematurely
    this.localOffsets = [
      { lx: 0.90, ly: 0.50 },  // 0: Front bumper left
      { lx: 0.45, ly: 0.82 },  // 1: Front left wheel fender
      { lx: -0.45, ly: 0.82 }, // 2: Rear left wheel flank
      { lx: -0.90, ly: 0.55 }, // 3: Rear bumper left
      { lx: -0.90, ly: -0.55 },// 4: Rear bumper right
      { lx: -0.45, ly: -0.82 },// 5: Rear right wheel flank
      { lx: 0.45, ly: -0.82 }, // 6: Front right wheel fender
      { lx: 0.90, ly: -0.50 }  // 7: Front bumper right
    ];

    this.corners = [];
    for (let i = 0; i < 8; i++) {
      this.corners.push({ x: 0, y: 0 });
    }
    this.frontCenter = { x: 0, y: 0 };
    this.rearCenter = { x: 0, y: 0 };
    this.prevCenter = { x: 0, y: 0 };
    this.currentCenter = { x: 0, y: 0 };
    this.prevX = 0;
    this.prevY = 0;
    this.stagnantFrames = 0;

    this.updateCorners();
  }

  /**
   * Resets car to start grid position with current brain
   */
  reset(x, y, angle) {
    this.startX = x;
    this.startY = y;
    this.startAngle = angle;
    this.x = x;
    this.y = y;
    this.prevX = x;
    this.prevY = y;
    this.prevCenter.x = x;
    this.prevCenter.y = y;
    this.stagnantFrames = 0;
    this.angle = angle;
    this.speed = 0;
    this.lateralVelocity = 0;
    this.angularVelocity = 0;
    this.isAlive = true;
    this.isCrashed = false;
    this.crashReason = '';
    this.fitness = 0;
    this.distanceTraveled = 0;
    this.checkpointsCrossed = 0;
    this.nextCheckpointIndex = 0;
    this.lapsCompleted = 0;
    this.totalFramesAlive = 0;
    this.framesSinceLastCheckpoint = 0;
    this.trail.length = 0;
    this.skidding = false;
    this.updateCorners();
  }

  /**
   * Calculate 8 chassis polygon corners in-place (Zero heap allocations)
   */
  updateCorners() {
    const halfW = this.width * 0.5;
    const halfL = this.length * 0.5;
    const cos = Math.cos(this.angle);
    const sin = Math.sin(this.angle);

    for (let i = 0; i < 8; i++) {
      const off = this.localOffsets[i];
      const px = off.lx * halfL;
      const py = off.ly * halfW;
      const c = this.corners[i];
      c.x = this.x + px * cos - py * sin;
      c.y = this.y + px * sin + py * cos;
    }

    const noseL = halfL * 0.90;
    this.frontCenter.x = this.x + cos * noseL;
    this.frontCenter.y = this.y + sin * noseL;
    this.rearCenter.x = this.x - cos * noseL;
    this.rearCenter.y = this.y - sin * noseL;
  }

  /**
   * Main physics & control update step
   */
  update(track, obstacles = [], soundEngine = null) {
    if (!this.isAlive) return;

    this.totalFramesAlive++;
    // Save previous position for continuous collision & trajectory checkpoint crossing
    this.prevX = this.x;
    this.prevY = this.y;
    this.prevCenter.x = this.x;
    this.prevCenter.y = this.y;

    // Track stagnation: only penalize cars that are genuinely stopped (< 0.25 px/f)
    if (Math.abs(this.speed) < 0.25) {
      this.stagnantFrames++;
    } else {
      this.stagnantFrames = Math.max(0, this.stagnantFrames - 2);
    }

    // 1. Update sensors (using spatial index)
    this.sensors.update(track, obstacles);

    // 2. Compute AI Brain outputs (if not human-driven)
    if (!this.isHuman) {
      this.evaluateBrain(track);
    }

    // 3. Apply physics dynamics
    this.applyPhysics();

    // 4. Update polygon corners
    this.updateCorners();

    // 5. Check wall and obstacle collisions
    if (this.checkCollision(track, obstacles)) {
      this.isAlive = false;
      this.isCrashed = true;
      this.crashReason = 'Wall Collision';
      if (this.isLeader && soundEngine) {
        soundEngine.playCrash();
      }
      return;
    }

    // 6. Check Checkpoints & Lap Progress
    this.updateCheckpoints(track, soundEngine);

    // 7. Stall / Reverse Timeout check
    // Human driver is never destroyed by timeouts; AI cars are only destroyed if truly trapped or lost
    if (!this.isHuman) {
      if (this.stagnantFrames > 220 || this.framesSinceLastCheckpoint > CONFIG.STALL_TIMEOUT_FRAMES) {
        this.isAlive = false;
        this.isCrashed = true;
        this.crashReason = this.stagnantFrames > 220 ? 'Immobile / Trapped' : 'Stalled / Inactive';
        return;
      }
    }

    // 8. Update Trail (only for active leader or human car to conserve memory)
    if ((this.isLeader || this.isHuman) && this.totalFramesAlive % 4 === 0) {
      this.trail.push({ x: this.x, y: this.y, alpha: 0.6 });
      if (this.trail.length > 20) this.trail.shift();
      for (let i = 0; i < this.trail.length; i++) {
        this.trail[i].alpha *= 0.95;
      }
    }
  }

  /**
   * Feed sensor readings and contextual state into the Neural Network
   */
  evaluateBrain(track) {
    const nextCp = track.checkpoints[this.nextCheckpointIndex];
    let angleToCheckpoint = 0;

    if (nextCp) {
      // Use precomputed checkpoint center
      const center = nextCp.center;
      const targetAngle = Math.atan2(center.y - this.y, center.x - this.x);

      // Angle difference normalized to [-1, 1]
      let diff = targetAngle - this.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      angleToCheckpoint = diff * 0.318309886; // 1 / Math.PI
    }

    // Normalized speed [-1, 1] and lateral drift velocity
    const normSpeed = this.speed * (1 / CONFIG.CAR.MAX_SPEED);
    const normLateral = Math.max(-1, Math.min(1, this.lateralVelocity * 0.33333333));

    // Fill pre-allocated Float32Array vector (0 heap allocations)
    const vec = this.inputVector;
    const r = this.sensors.readings;
    vec[0] = r[0];
    vec[1] = r[1];
    vec[2] = r[2];
    vec[3] = r[3];
    vec[4] = r[4];
    vec[5] = r[5];
    vec[6] = r[6];
    vec[7] = normSpeed;
    vec[8] = angleToCheckpoint;
    vec[9] = normLateral;

    // Predict controls
    const outputs = this.brain.predict(vec);

    // outputs[0] = Throttle / Brake (-1 to 1)
    // outputs[1] = Steering (-1 to 1)
    // outputs[2] = Drift toggle (0 to 1)
    // Apply forward bias so agents naturally drive forward
    this.controls.throttle = Math.max(-0.6, outputs[0] * 0.7 + 0.3);
    this.controls.steering = outputs[1];
    this.controls.drift = outputs[2] > 0.5;
  }

  /**
   * Kinematic bicycle physics model with friction & drift
   */
  applyPhysics() {
    const cfg = CONFIG.CAR;
    const throttle = this.controls.throttle;
    const steering = this.controls.steering;
    const isDrifting = this.controls.drift;

    // Acceleration & Braking
    if (throttle > 0) {
      this.speed += throttle * cfg.ACCELERATION;
    } else if (throttle < 0) {
      if (this.speed > 0.1) {
        // Active braking slows forward speed towards 0
        this.speed += throttle * cfg.BRAKE_FORCE;
        if (this.speed < 0) this.speed = 0;
      } else if (this.isHuman) {
        // Only human player can engage reverse
        this.speed += throttle * (cfg.ACCELERATION * 0.35);
      } else {
        this.speed = 0;
      }
    }

    // Clamp speed limits
    this.speed = Math.max(cfg.REVERSE_MAX_SPEED, Math.min(cfg.MAX_SPEED, this.speed));

    // Turning dynamics: turning ability scales with speed, cannot turn if dead stop
    const speedRatio = Math.abs(this.speed) / cfg.MAX_SPEED;
    const turnFactor = Math.max(cfg.MIN_TURN_SPEED_FACTOR, Math.min(1.0, speedRatio * 1.5));
    const turnRate = steering * cfg.TURN_SPEED * turnFactor;

    // Reverse turning is inverted
    const dir = this.speed >= 0 ? 1 : -1;
    this.angle += turnRate * dir;

    // Drift & Lateral grip
    const grip = isDrifting ? 0.75 : cfg.LATERAL_GRIP;
    this.lateralVelocity *= grip;

    // Detect if car is skidding/drifting
    this.skidding = (Math.abs(steering) > 0.6 && Math.abs(this.speed) > cfg.MAX_SPEED * 0.55) || isDrifting;

    // Forward displacement
    const vx = Math.cos(this.angle) * this.speed;
    const vy = Math.sin(this.angle) * this.speed;

    this.x += vx;
    this.y += vy;

    // Drag / Friction
    this.speed *= cfg.FRICTION;
    if (Math.abs(this.speed) < 0.02) this.speed = 0;

    // Total distance traveled along forward trajectory
    if (this.speed > 0) {
      this.distanceTraveled += this.speed;
    }
  }

  /**
   * High-Precision Hitbox Collision check using 8-Point Chassis Polygon & Spatial Index
   */
  checkCollision(track, obstacles = []) {
    const boundR = this.length * 0.52;
    const minX = this.x - boundR;
    const maxX = this.x + boundR;
    const minY = this.y - boundR;
    const maxY = this.y + boundR;

    if (track.spatialIndex) {
      // Zero closure, direct 8-point polygon collision check
      if (track.spatialIndex.checkCarCollision(this.corners, minX, minY, maxX, maxY)) {
        return true;
      }
    } else {
      const wallSegments = track.wallSegments || track;
      for (let c = 0; c < 8; c++) {
        const p1 = this.corners[c];
        const p2 = this.corners[(c + 1) % 8];
        for (let s = 0; s < wallSegments.length; s++) {
          if (this.segmentsIntersect(p1, p2, wallSegments[s].a, wallSegments[s].b)) {
            return true;
          }
        }
      }
    }

    // Dynamic Obstacles: Exact circular proximity test against the 8 chassis polygon edges
    if (obstacles.length > 0) {
      for (let o = 0; o < obstacles.length; o++) {
        const obs = obstacles[o];
        const r = obs.radius;
        const rSq = r * r;

        // Quick broad-phase rejection circle
        const distCenterSq = (obs.x - this.x) * (obs.x - this.x) + (obs.y - this.y) * (obs.y - this.y);
        if (distCenterSq > (r + boundR) * (r + boundR)) continue;

        // Narrow-phase distance to each of the 8 car chassis edges
        for (let c = 0; c < 8; c++) {
          const p1 = this.corners[c];
          const p2 = this.corners[(c + 1) % 8];
          const edgeDx = p2.x - p1.x;
          const edgeDy = p2.y - p1.y;
          const edgeLenSq = edgeDx * edgeDx + edgeDy * edgeDy;
          const t = Math.max(0, Math.min(1, ((obs.x - p1.x) * edgeDx + (obs.y - p1.y) * edgeDy) / (edgeLenSq || 1)));
          const closeX = p1.x + t * edgeDx;
          const closeY = p1.y + t * edgeDy;
          const dSq = (obs.x - closeX) * (obs.x - closeX) + (obs.y - closeY) * (obs.y - closeY);
          if (dSq <= rSq) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Helper to check 2D line segment intersection (Zero heap allocation, fast short-circuit)
   */
  segmentsIntersect(A, B, C, D) {
    const ax = A.x, ay = A.y, bx = B.x, by = B.y;
    const cx = C.x, cy = C.y, dx = D.x, dy = D.y;
    const ccw1 = (dy - cy) * (ax - cx) > (dx - cx) * (ay - cy);
    const ccw2 = (dy - cy) * (bx - cx) > (dx - cx) * (by - cy);
    if (ccw1 === ccw2) return false;
    const ccw3 = (by - ay) * (cx - ax) > (bx - ax) * (cy - ay);
    const ccw4 = (by - ay) * (dx - ax) > (bx - ax) * (dy - ay);
    return ccw3 !== ccw4;
  }

  /**
   * Checkpoint crossing and lap progression logic with continuous trajectory detection
   */
  updateCheckpoints(track, soundEngine) {
    if (!track.checkpoints || track.checkpoints.length === 0) return;

    const nextCp = track.checkpoints[this.nextCheckpointIndex];
    if (!nextCp) return;

    // Continuous detection: test both static car body and continuous motion trajectory
    this.currentCenter.x = this.x;
    this.currentCenter.y = this.y;
    const crossedByBody = this.segmentsIntersect(this.rearCenter, this.frontCenter, nextCp.a, nextCp.b);
    const crossedByMotion = this.segmentsIntersect(this.prevCenter, this.currentCenter, nextCp.a, nextCp.b);

    if (crossedByBody || crossedByMotion) {
      // Heading check: heading or motion vector should move along checkpoint normal
      const forwardDot = Math.cos(this.angle) * nextCp.normal.x + Math.sin(this.angle) * nextCp.normal.y;
      const motionDot = (this.x - this.prevX) * nextCp.normal.x + (this.y - this.prevY) * nextCp.normal.y;

      if (forwardDot > -0.25 || motionDot > 0) {
        // Successfully passed checkpoint!
        this.checkpointsCrossed++;
        this.framesSinceLastCheckpoint = 0;
        this.stagnantFrames = 0;

        // Advance next checkpoint index
        const prevIndex = this.nextCheckpointIndex;
        this.nextCheckpointIndex = (this.nextCheckpointIndex + 1) % track.checkpoints.length;

        // If completed full loop back to checkpoint 0
        if (prevIndex === track.checkpoints.length - 1 && this.nextCheckpointIndex === 0) {
          this.lapsCompleted++;
          const lapTimeSeconds = (this.totalFramesAlive - this.lapStartTime) / 60;
          this.lapStartTime = this.totalFramesAlive;
          if (lapTimeSeconds < this.bestLapTime) {
            this.bestLapTime = lapTimeSeconds;
          }
          if (soundEngine) {
            soundEngine.playLapCheer();
          }
        }
      }
    }

    // Calculate live fitness
    this.calculateFitness(track);
  }

  /**
   * Comprehensive fitness formula:
   * Rewards:
   * - Total checkpoints passed (heavily weighted: 1000 each)
   * - Laps completed (super heavily weighted: 25000 each)
   * - Progress towards the next checkpoint (0 to 800)
   * - Average speed bonus (rewards racing speed)
   */
  calculateFitness(track) {
    let cpProgressBonus = 0;
    const nextCp = track.checkpoints[this.nextCheckpointIndex];
    if (nextCp) {
      const cpMidX = (nextCp.a.x + nextCp.b.x) * 0.5;
      const cpMidY = (nextCp.a.y + nextCp.b.y) * 0.5;
      const distToNext = Math.hypot(cpMidX - this.x, cpMidY - this.y);
      // Normalized proximity to next checkpoint
      cpProgressBonus = Math.max(0, 1000 - distToNext * 2);
    }

    const speedBonus = this.distanceTraveled * 0.5;
    const lapBonus = this.lapsCompleted * 25000;
    const checkpointBonus = this.checkpointsCrossed * 1000;

    this.fitness = checkpointBonus + lapBonus + cpProgressBonus + speedBonus;
  }

  /**
   * Render car on 2D canvas with high visual fidelity and optimized batching
   */
  draw(ctx, options = {}) {
    const { showRays = false, isFocused = false } = options;

    if (!this.isAlive) {
      // Ultra-fast rendering for crashed cars
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);
      ctx.fillStyle = '#161d2d';
      ctx.strokeStyle = '#2b364a';
      ctx.lineWidth = 1;
      const hL = this.length * 0.5;
      const hW = this.width * 0.5;
      ctx.fillRect(-hL, -hW, this.length, this.width);
      ctx.strokeRect(-hL, -hW, this.length, this.width);
      ctx.restore();
      return;
    }

    // 1. Draw LIDAR sensor rays if enabled
    if (showRays) {
      this.drawSensors(ctx);
    }

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    const isHighPriority = this.isLeader || this.isHuman || isFocused;
    const halfL = this.length * 0.5;
    const halfW = this.width * 0.5;

    // 2. Underglow Shadow: ONLY apply subtle blur for priority cars
    if (isHighPriority) {
      ctx.shadowColor = this.isHuman ? 'rgba(16, 185, 129, 0.45)' : 'rgba(250, 250, 250, 0.4)';
      ctx.shadowBlur = 6;
    }

    // Underbody shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(-halfL * 1.04, -halfW * 1.08, halfL * 2.08, halfW * 2.16);

    if (isHighPriority) {
      ctx.shadowBlur = 0; // Turn off blur for remaining body elements
    }

    // 3. Headlight Beams (only for high priority cars to eliminate fill-rate overhead)
    if (isHighPriority) {
      const beamGrad = ctx.createLinearGradient(halfL, 0, halfL + 65, 0);
      beamGrad.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
      beamGrad.addColorStop(0.3, 'rgba(250, 250, 250, 0.15)');
      beamGrad.addColorStop(1, 'rgba(250, 250, 250, 0)');

      ctx.fillStyle = beamGrad;
      ctx.beginPath();
      ctx.moveTo(halfL * 0.9, -halfW * 0.35);
      ctx.lineTo(halfL + 65, -halfW * 1.3);
      ctx.lineTo(halfL + 65, halfW * 1.3);
      ctx.lineTo(halfL * 0.9, halfW * 0.35);
      ctx.closePath();
      ctx.fill();
    }

    // 4. Main Car Body (Chassis)
    let bodyColor;
    if (this.isLeader) {
      bodyColor = '#fafafa';
    } else if (this.isHuman) {
      bodyColor = '#10b981';
    } else {
      bodyColor = this.color;
    }

    ctx.fillStyle = bodyColor;
    ctx.strokeStyle = isHighPriority ? '#ffffff' : '#3f3f46';
    ctx.lineWidth = isHighPriority ? 1.6 : 1;

    // Aerodynamic sports car body contour
    ctx.beginPath();
    ctx.moveTo(halfL, -halfW * 0.6);
    ctx.quadraticCurveTo(halfL + 2, 0, halfL, halfW * 0.6);
    ctx.lineTo(halfL * 0.5, halfW);
    ctx.lineTo(-halfL * 0.4, halfW);
    ctx.lineTo(-halfL * 0.7, halfW * 0.95);
    ctx.lineTo(-halfL, halfW * 0.7);
    ctx.lineTo(-halfL, -halfW * 0.7);
    ctx.lineTo(-halfL * 0.7, -halfW * 0.95);
    ctx.lineTo(-halfL * 0.4, -halfW);
    ctx.lineTo(halfL * 0.5, -halfW);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 5. Cockpit / Windshield (tinted glass)
    ctx.fillStyle = '#070a13';
    ctx.beginPath();
    ctx.moveTo(halfL * 0.35, -halfW * 0.5);
    ctx.lineTo(halfL * 0.35, halfW * 0.5);
    ctx.lineTo(-halfL * 0.2, halfW * 0.55);
    ctx.lineTo(-halfL * 0.35, halfW * 0.4);
    ctx.lineTo(-halfL * 0.35, -halfW * 0.4);
    ctx.lineTo(-halfL * 0.2, -halfW * 0.55);
    ctx.closePath();
    ctx.fill();

    // 6. Rear Spoiler / Wing
    ctx.fillStyle = this.isLeader ? '#27272a' : (this.isHuman ? '#059669' : '#18181b');
    ctx.fillRect(-halfL - 2, -halfW * 0.85, 3.5, halfW * 1.7);

    // 7. Taillights
    const isBraking = this.controls.throttle < 0;
    ctx.fillStyle = isBraking ? '#ef4444' : '#991b1b';
    ctx.fillRect(-halfL, -halfW * 0.65, 2, 4);
    ctx.fillRect(-halfL, halfW * 0.65 - 4, 2, 4);

    // 8. Badges: Crown for Leader, 'YOU' for Human
    if (this.isLeader) {
      this.drawCrownBadge(ctx);
    } else if (this.isHuman) {
      this.drawHumanBadge(ctx);
    }

    ctx.restore();
  }

  /**
   * Draw LIDAR laser beams from sensors
   */
  drawSensors(ctx) {
    ctx.save();
    for (let i = 0; i < this.sensors.rays.length; i++) {
      const ray = this.sensors.rays[i];
      const proximity = ray.proximity;

      // Color shifts from subtle zinc/white (clear) to amber (close) to red (imminent collision)
      ctx.beginPath();
      ctx.moveTo(ray.start.x, ray.start.y);
      ctx.lineTo(ray.end.x, ray.end.y);

      if (proximity > 0.6) {
        ctx.strokeStyle = `rgba(239, 68, 68, ${0.4 + proximity * 0.6})`;
        ctx.lineWidth = 1.6;
      } else if (proximity > 0.2) {
        ctx.strokeStyle = `rgba(245, 158, 11, ${0.3 + proximity * 0.5})`;
        ctx.lineWidth = 1.1;
      } else {
        ctx.strokeStyle = 'rgba(250, 250, 250, 0.25)';
        ctx.lineWidth = 0.8;
      }
      ctx.stroke();

      // Contact dot if hitting barrier
      if (ray.hit) {
        ctx.fillStyle = proximity > 0.5 ? '#ef4444' : '#fafafa';
        ctx.beginPath();
        ctx.arc(ray.hit.x, ray.hit.y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /**
   * Draw golden crown badge above leader car
   */
  drawCrownBadge(ctx) {
    ctx.save();
    ctx.translate(0, 0);
    ctx.fillStyle = '#f59e0b';
    ctx.strokeStyle = '#fafafa';
    ctx.lineWidth = 1;
    ctx.shadowColor = 'rgba(245, 158, 11, 0.5)';
    ctx.shadowBlur = 6;

    // Small floating crown icon
    const cy = -this.width * 1.5;
    ctx.beginPath();
    ctx.moveTo(-7, cy);
    ctx.lineTo(-9, cy - 8);
    ctx.lineTo(-4, cy - 5);
    ctx.lineTo(0, cy - 10);
    ctx.lineTo(4, cy - 5);
    ctx.lineTo(9, cy - 8);
    ctx.lineTo(7, cy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Draw player badge above human car
   */
  drawHumanBadge(ctx) {
    ctx.save();
    ctx.fillStyle = '#10b981';
    ctx.strokeStyle = '#022c22';
    ctx.lineWidth = 2;
    ctx.font = '600 10px Inter, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(16, 185, 129, 0.4)';
    ctx.shadowBlur = 6;
    ctx.strokeText('YOU', 0, -this.width * 1.6);
    ctx.fillText('YOU', 0, -this.width * 1.6);
    ctx.restore();
  }
}
