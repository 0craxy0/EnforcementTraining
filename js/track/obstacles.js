/**
 * Dynamic Obstacles (Moving Pylons / Road Hazards)
 */
export class DynamicObstacle {
  constructor(x, y, radius = 12, moveRange = 0, moveSpeed = 0, axis = 'x') {
    this.baseX = x;
    this.baseY = y;
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.moveRange = moveRange;
    this.moveSpeed = moveSpeed;
    this.axis = axis;
    this.timer = Math.random() * Math.PI * 2;
  }

  update() {
    if (this.moveRange > 0 && this.moveSpeed > 0) {
      this.timer += this.moveSpeed;
      const offset = Math.sin(this.timer) * this.moveRange;
      if (this.axis === 'x') {
        this.x = this.baseX + offset;
      } else {
        this.y = this.baseY + offset;
      }
    }
  }

  /**
   * Returns obstacle bounding box as 4 line segments for raycasting/collision
   */
  getSegments() {
    const r = this.radius;
    const p1 = { x: this.x - r, y: this.y - r };
    const p2 = { x: this.x + r, y: this.y - r };
    const p3 = { x: this.x + r, y: this.y + r };
    const p4 = { x: this.x - r, y: this.y + r };

    return [
      { a: p1, b: p2 },
      { a: p2, b: p3 },
      { a: p3, b: p4 },
      { a: p4, b: p1 }
    ];
  }

  draw(ctx) {
    ctx.save();
    // Warning hazard stripes / glowing pylon
    ctx.shadowColor = '#ff0055';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#ff0055';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Inner core
    ctx.fillStyle = '#ffeef2';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius * 0.45, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}
