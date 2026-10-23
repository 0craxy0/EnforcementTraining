/**
 * High-Performance Particle System
 * Optimized with Persistent Offscreen Skid Buffer & Capped Particle Pools
 */
export class ParticleSystem {
  constructor() {
    this.particles = [];
    this.maxParticles = 120;

    // Persistent offscreen canvas for skid marks
    this.skidCanvas = null;
    this.skidCtx = null;
    this.fadeTimer = 0;
  }

  /**
   * Initialize or resize the skid canvas to match track bounds
   */
  initSkidBuffer(width = 2000, height = 2000) {
    if (typeof document === 'undefined') return;
    if (!this.skidCanvas) {
      this.skidCanvas = document.createElement('canvas');
      this.skidCanvas.width = width;
      this.skidCanvas.height = height;
      this.skidCtx = this.skidCanvas.getContext('2d');
    }
  }

  /**
   * Add skid mark by painting directly to persistent buffer (0 array allocations)
   */
  addSkidMark(x, y, angle, width = 3.5, alpha = 0.35) {
    if (!this.skidCtx) {
      this.initSkidBuffer();
    }
    const ctx = this.skidCtx;
    if (!ctx) return;
    ctx.fillStyle = `rgba(10, 15, 25, ${alpha * 0.35})`;
    ctx.beginPath();
    ctx.arc(x, y, width * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * Emit collision sparks when a car crashes
   */
  emitSparks(x, y, count = 12) {
    if (this.particles.length > this.maxParticles) return;
    const actualCount = Math.min(count, this.maxParticles - this.particles.length);

    for (let i = 0; i < actualCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 4.0;
      this.particles.push({
        type: 'spark',
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: Math.random() > 0.4 ? '#ffcc00' : '#ff3300',
        size: 1.5 + Math.random() * 2.0,
        alpha: 1.0,
        decay: 0.04 + Math.random() * 0.04
      });
    }
  }

  /**
   * Emit tire smoke during drift
   */
  emitSmoke(x, y) {
    if (Math.random() > 0.4 || this.particles.length > this.maxParticles) return;
    this.particles.push({
      type: 'smoke',
      x: x + (Math.random() - 0.5) * 4,
      y: y + (Math.random() - 0.5) * 4,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      color: 'rgba(200, 210, 230,',
      size: 3 + Math.random() * 2.5,
      alpha: 0.3,
      decay: 0.025
    });
  }

  /**
   * Emit lap completion victory confetti burst
   */
  emitLapConfetti(x, y, count = 50) {
    const colors = ['#00f0ff', '#ff0055', '#ffb700', '#00ff88', '#ffffff'];
    const actualCount = Math.min(count, 60);

    for (let i = 0; i < actualCount; i++) {
      const angle = -Math.PI * 0.5 + (Math.random() - 0.5) * Math.PI * 0.8;
      const speed = 3.5 + Math.random() * 7;
      this.particles.push({
        type: 'confetti',
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        gravity: 0.14,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.2,
        color: colors[Math.floor(Math.random() * colors.length)],
        width: 4 + Math.random() * 4,
        height: 5 + Math.random() * 6,
        alpha: 1.0,
        decay: 0.015 + Math.random() * 0.01
      });
    }
  }

  /**
   * Update all particles
   */
  update() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;

      if (p.gravity) p.vy += p.gravity;
      if (p.rotation !== undefined) p.rotation += p.rotSpeed;
      if (p.type === 'smoke') p.size += 0.2;

      p.alpha -= p.decay;

      if (p.alpha <= 0) {
        const last = this.particles.pop();
        if (i < this.particles.length) {
          this.particles[i] = last;
        }
      }
    }

    // Slowly fade skid canvas once every 90 frames to prevent unlimited memory
    if (++this.fadeTimer > 90) {
      this.fadeTimer = 0;
      if (this.skidCtx) {
        this.skidCtx.save();
        this.skidCtx.globalCompositeOperation = 'destination-out';
        this.skidCtx.fillStyle = 'rgba(0, 0, 0, 0.02)';
        this.skidCtx.fillRect(0, 0, this.skidCanvas.width, this.skidCanvas.height);
        this.skidCtx.restore();
      }
    }
  }

  /**
   * Draw skid marks using a single blit from persistent buffer
   */
  drawSkidMarks(ctx) {
    if (this.skidCanvas) {
      ctx.drawImage(this.skidCanvas, 0, 0);
    }
  }

  /**
   * Draw active particles (sparks, smoke, confetti)
   */
  draw(ctx) {
    const len = this.particles.length;
    if (len === 0) return;

    ctx.save();
    for (let i = 0; i < len; i++) {
      const p = this.particles[i];

      if (p.type === 'spark') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === 'smoke') {
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = '#c8d2e6';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
      } else if (p.type === 'confetti') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.fillRect(-p.width * 0.5, -p.height * 0.5, p.width, p.height);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  /**
   * Clear all particles and reset skid canvas
   */
  clear() {
    this.particles = [];
    if (this.skidCtx && this.skidCanvas) {
      this.skidCtx.clearRect(0, 0, this.skidCanvas.width, this.skidCanvas.height);
    }
  }
}
