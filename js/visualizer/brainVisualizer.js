/**
 * Live Neural Network Brain Visualizer (HUD)
 */
export class BrainVisualizer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    this.inputLabels = [
      'L-68°', 'L-40°', 'L-18°', 'FWD', 'R+18°', 'R+40°', 'R+68°',
      'SPEED', 'TARGET', 'SLIP'
    ];

    this.outputLabels = ['THROTTLE', 'STEER', 'DRIFT'];
    this.pulseOffset = 0;
  }

  /**
   * Render the neural network structure, weights, and live activations
   * @param {NeuralNetwork} network
   */
  draw(network) {
    if (!network) return;

    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    const layerSizes = network.layerSizes; // e.g. [10, 12, 8, 3]
    const numLayers = layerSizes.length;
    const layerSpacing = (w - 70) / (numLayers - 1);

    // Compute node coordinates
    const nodeCoords = [];
    for (let l = 0; l < numLayers; l++) {
      const size = layerSizes[l];
      const x = 35 + l * layerSpacing;
      const nodeSpacing = (h - 40) / Math.max(1, size - 1);
      const coords = [];

      for (let i = 0; i < size; i++) {
        const y = 20 + i * nodeSpacing;
        coords.push({ x, y });
      }
      nodeCoords.push(coords);
    }

    this.pulseOffset = (this.pulseOffset + 0.05) % 1;

    // 1. Draw Synapses (Connections)
    for (let l = 0; l < numLayers - 1; l++) {
      const inCoords = nodeCoords[l];
      const outCoords = nodeCoords[l + 1];
      const weights = network.weights[l]; // [outSize][inSize]

      for (let j = 0; j < outCoords.length; j++) {
        for (let i = 0; i < inCoords.length; i++) {
          const weight = weights[j][i];
          const absWeight = Math.abs(weight);
          if (absWeight < 0.15) continue; // Skip near-zero connections for visual clarity

          const p1 = inCoords[i];
          const p2 = outCoords[j];

          // Color: Crisp white/sky for positive excitation, Rose/Red for negative inhibition
          const isPos = weight > 0;
          const alpha = Math.min(0.75, Math.max(0.12, absWeight * 0.35));
          const strokeColor = isPos
            ? `rgba(250, 250, 250, ${alpha})`
            : `rgba(239, 68, 68, ${alpha})`;

          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = Math.min(2.0, Math.max(0.6, absWeight * 0.5));
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();

          // Animated flowing pulse if input node is active
          const inActivation = Math.abs(network.activations[l][i] || 0);
          if (inActivation > 0.25 && absWeight > 0.8) {
            const px = p1.x + (p2.x - p1.x) * this.pulseOffset;
            const py = p1.y + (p2.y - p1.y) * this.pulseOffset;
            ctx.fillStyle = isPos ? '#fafafa' : '#ef4444';
            ctx.beginPath();
            ctx.arc(px, py, 1.4, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }

    // 2. Draw Nodes
    for (let l = 0; l < numLayers; l++) {
      const coords = nodeCoords[l];
      const activations = network.activations[l] || [];

      for (let i = 0; i < coords.length; i++) {
        const { x, y } = coords[i];
        const val = activations[i] !== undefined ? activations[i] : 0;
        const radius = (l === 0 || l === numLayers - 1) ? 5.5 : 4.5;

        // Node Glow & Fill based on activation (shadcn clean zinc styling)
        ctx.save();
        if (val > 0) {
          ctx.fillStyle = `rgba(250, 250, 250, ${0.4 + Math.min(0.6, val)})`;
          ctx.shadowColor = 'rgba(250, 250, 250, 0.4)';
          ctx.shadowBlur = 4 * Math.min(1, val);
        } else if (val < 0) {
          ctx.fillStyle = `rgba(239, 68, 68, ${0.4 + Math.min(0.6, Math.abs(val))})`;
          ctx.shadowColor = 'rgba(239, 68, 68, 0.4)';
          ctx.shadowBlur = 4 * Math.min(1, Math.abs(val));
        } else {
          ctx.fillStyle = '#27272a';
          ctx.shadowBlur = 0;
        }

        ctx.strokeStyle = '#52525b';
        ctx.lineWidth = 1;

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // 3. Draw Labels for Input & Output layers
        ctx.save();
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.textBaseline = 'middle';

        if (l === 0) {
          ctx.textAlign = 'right';
          ctx.fillStyle = '#a1a1aa';
          const label = this.inputLabels[i] || `IN ${i}`;
          ctx.fillText(label, x - 9, y);
        } else if (l === numLayers - 1) {
          ctx.textAlign = 'left';
          const label = this.outputLabels[i] || `OUT ${i}`;
          const valStr = val.toFixed(2);
          ctx.fillStyle = '#fafafa';
          ctx.fillText(`${label} [${valStr}]`, x + 9, y);
        }
        ctx.restore();
      }
    }
  }
}
