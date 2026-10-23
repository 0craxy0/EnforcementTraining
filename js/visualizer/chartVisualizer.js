/**
 * Real-time Generation Fitness Progression Chart
 */
export class ChartVisualizer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  /**
   * Draw the fitness curve across generations
   * @param {Array<{gen: number, maxFitness: number, avgFitness: number, laps: number}>} history
   */
  draw(history) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    const padLeft = 35;
    const padRight = 15;
    const padTop = 15;
    const padBottom = 25;

    const plotW = w - padLeft - padRight;
    const plotH = h - padTop - padBottom;

    // Draw background box
    ctx.fillStyle = 'rgba(9, 9, 11, 0.4)';
    ctx.fillRect(padLeft, padTop, plotW, plotH);

    if (!history || history.length < 2) {
      // Empty state guidance
      ctx.fillStyle = '#71717a';
      ctx.font = '11px "Inter", -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Training in progress (Gen 1)...', w * 0.5, h * 0.5);
      return;
    }

    // Determine min/max fitness for scaling
    let maxFit = 1000;
    for (let i = 0; i < history.length; i++) {
      if (history[i].maxFitness > maxFit) maxFit = history[i].maxFitness;
    }
    maxFit = Math.ceil(maxFit * 1.15); // Add 15% headroom

    const numPoints = history.length;
    const stepX = plotW / Math.max(1, numPoints - 1);

    // 1. Draw subtle horizontal grid lines & Y-labels
    ctx.save();
    ctx.strokeStyle = '#27272a';
    ctx.lineWidth = 1;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.fillStyle = '#71717a';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    const gridDivisions = 4;
    for (let g = 0; g <= gridDivisions; g++) {
      const yVal = Math.round((maxFit / gridDivisions) * g);
      const py = padTop + plotH - (g / gridDivisions) * plotH;

      ctx.beginPath();
      ctx.moveTo(padLeft, py);
      ctx.lineTo(w - padRight, py);
      ctx.stroke();

      const label = yVal >= 1000 ? `${(yVal / 1000).toFixed(1)}k` : `${yVal}`;
      ctx.fillText(label, padLeft - 6, py);
    }

    // X-axis label
    ctx.textAlign = 'center';
    ctx.fillText(`Gen ${history[0].gen}`, padLeft + 12, h - 8);
    ctx.fillText(`Gen ${history[history.length - 1].gen}`, w - padRight - 12, h - 8);
    ctx.restore();

    // 2. Draw Average Fitness Line (Muted Zinc #71717a)
    ctx.save();
    ctx.strokeStyle = '#71717a';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    for (let i = 0; i < numPoints; i++) {
      const x = padLeft + i * stepX;
      const y = padTop + plotH - (history[i].avgFitness / maxFit) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    // 3. Draw Max Fitness Line (Crisp White #fafafa with clean gradient)
    ctx.save();
    const areaGrad = ctx.createLinearGradient(0, padTop, 0, padTop + plotH);
    areaGrad.addColorStop(0, 'rgba(250, 250, 250, 0.12)');
    areaGrad.addColorStop(1, 'rgba(250, 250, 250, 0.0)');

    // Fill area under max curve
    ctx.beginPath();
    ctx.moveTo(padLeft, padTop + plotH);
    for (let i = 0; i < numPoints; i++) {
      const x = padLeft + i * stepX;
      const y = padTop + plotH - (history[i].maxFitness / maxFit) * plotH;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(padLeft + (numPoints - 1) * stepX, padTop + plotH);
    ctx.closePath();
    ctx.fillStyle = areaGrad;
    ctx.fill();

    // Line stroke
    ctx.strokeStyle = '#fafafa';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < numPoints; i++) {
      const x = padLeft + i * stepX;
      const y = padTop + plotH - (history[i].maxFitness / maxFit) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    // 4. Draw Lap Achievement Indicators
    ctx.save();
    for (let i = 0; i < numPoints; i++) {
      if (history[i].laps > 0) {
        const x = padLeft + i * stepX;
        const y = padTop + plotH - (history[i].maxFitness / maxFit) * plotH;

        ctx.fillStyle = '#10b981';
        ctx.strokeStyle = '#09090b';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}
