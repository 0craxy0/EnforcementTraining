# NEURO-DRIFT // AI Enforcement Training Visualization

An interactive, high-performance web simulation of autonomous AI agents learning to navigate complex racing circuits and difficult paths through neuroevolution (Genetic Algorithm + Multi-Layer Perceptrons).

![Simulation Preview](assets/favicon.svg)

---

## 🏎️ Core Features

- **Modern shadcn/ui Design System (Zinc Dark)**:
  - Pixel-perfect implementation of [shadcn/ui](https://ui.shadcn.com) design tokens and Radix-inspired component patterns.
  - Minimalist Dark Zinc palette (`#09090b` background, `#0e0e12` cards, `#27272a` borders, `#fafafa` typography).
  - Radix-style interactive components: Button variants, Sliders, Toggle Switches, Select, Badges, floating Toolbar dock, and clean Lucide SVG icons.
- **Customizable Swarm Population**: Dial anywhere from **5 to 120+ autonomous AI cars** concurrently learning in real time.
- **Genetic Algorithm & Neuroevolution**:
  - **7-Ray LIDAR Array**: Continuous proximity raycasting against walls and dynamic obstacles.
  - **Neural Architecture**: 10 Inputs $\to$ 12 Hidden $\to$ 8 Hidden $\to$ 3 Outputs (Throttle, Steering, Drift).
  - **Tournament Selection & Elitism**: Automatically protects the top 10% elite champion genomes across generations.
  - **Gaussian Mutation & Crossover**: Real-time adjustable mutation rate (1% to 40%) and perturbation force.
- **Difficult Path Circuits**:
  1. **The Serpent's Coil (Hard)**: Decreasing radius hairpins, an S-chicane, and narrowing bottlenecks.
  2. **Suzuka Apex Gauntlet (Expert)**: High-speed esses, double-apex hairpin, and technical final chicane.
  3. **Neon Metropolis 2088 (Urban Tech)**: 90° urban bends, long tunnel straight, and speed sectors.
  4. **Daytona Warmup (Fast Oval)**: High-speed banked tri-oval for rapid baseline evaluation.
  - **Dynamic Hazard Pylons**: Moving obstacle blocks that challenge agent reflexes.
- **Live Brain Visualizer (HUD)**:
  - Real-time animated synapse pulses showing positive excitation, negative inhibition, and active signal flow in clean zinc/monochrome styling.
- **Telemetry & Analytics**:
  - Live Leaderboard with Sector Progress, Speedometer, and Steering angle.
  - Real-time Generation Fitness Progression Chart (Max vs Average fitness curve + Lap milestone indicators).
- **Interactive Camera Controls**:
  - Track Overview (auto-fits circuit bounds)
  - Follow Leader (smooth zoom and follow the #1 frontrunner)
  - Follow Player
  - Free Pan & Zoom (click & drag, mouse wheel)
- **Challenger Player Mode (P1)**:
  - Jump into the driver's seat of a human racer car using `WASD` or Arrow keys to compete directly against the AI swarm!
- **Procedural Audio Synthesis**:
  - Web Audio API procedural sounds for engine humming, tire screeching, collision crunch, and lap victory fanfare.
- **Model Import / Export**:
  - Save trained champion neural network weights as JSON and import custom models.

---

## 🚀 Running Locally

Start a local HTTP server:
```bash
# Using Python
python3 -m http.server 8080

# Or using Node.js
npx serve -l 8080
```
Open **`http://localhost:8080`** in any modern web browser.

---

## 🎮 Keyboard Controls

| Key | Action |
|---|---|
| <kbd>SPACE</kbd> | Pause / Resume Simulation (or Drift if Player Mode is active) |
| <kbd>W</kbd> / <kbd>↑</kbd> | Accelerate Player Car (P1) |
| <kbd>S</kbd> / <kbd>↓</kbd> | Brake / Reverse Player Car (P1) |
| <kbd>A</kbd> / <kbd>←</kbd> | Steer Left |
| <kbd>D</kbd> / <kbd>→</kbd> | Steer Right |
| <kbd>N</kbd> | Force Advance to Next Generation |
| <kbd>C</kbd> | Re-center Camera to Whole Track Overview |

---

## ⚡ High-Performance Optimization Architecture

To maintain silky-smooth 60+ FPS even with **100+ concurrent cars at 10X turbo speed**, the simulation employs extensive zero-overhead engineering:

1. **2D Spatial Hash Grid (`SpatialSegmentIndex`)**:
   - Indexes all 672 track wall segments into a hash grid.
   - Reduces LIDAR raycasting and car edge collision checks from 672 segments down to **5–30 local candidate segments per test** (~17x–60x reduction).
2. **Zero-Allocation Physics & Neural Inference**:
   - **`Float32Array` Activations**: Pre-allocated contiguous memory buffers for neural network layers eliminating transient heap allocations.
   - **Pre-allocated Vectors**: Pre-allocated `inputVector`, `corners`, `frontCenter`, `rearCenter`, and scratch intersection structs eliminate GC pauses.
3. **Offscreen Canvas Track Caching**:
   - Pre-renders static track geometry (asphalt ribbon, apex curbs, centerline, and glowing neon barriers) once onto an offscreen canvas.
   - Replaces thousands of per-frame vector path strokes and expensive `shadowBlur` passes with a single blit (`ctx.drawImage`).
4. **Persistent Skid Mark Buffer**:
   - Paints tire skid marks directly into an offscreen canvas buffer rather than iterating over thousands of individual circle objects.
5. **Frustum Culling & Streamlined Car Rendering**:
   - Cars outside the current camera view frustum are skipped during zoomed-in follow modes.
   - Crashed cars render with a lightweight silhouette; expensive glow effects are strictly isolated to the leader and player cars.
6. **Throttled DOM & HUD Redraws**:
   - Cached DOM elements eliminate `getElementById` layout thrashing.
   - DOM text updates are throttled to 15 FPS; secondary HUD canvases (brain visualizer and fitness chart) are throttled to 30 FPS and skipped when collapsed.

---

## 🧠 Project Architecture

```
EnforcementTraining/
├── index.html                  # Main application structure & HUD layout
├── style.css                   # Cyberpunk glassmorphism design system
├── assets/
│   └── favicon.svg             # High-tech vector favicon
└── js/
    ├── main.js                 # App initialization, main game loop, UI bindings
    ├── config.js               # Physics constants, neural hyper-parameters
    ├── physics/
    │   ├── car.js              # Vehicle kinematic bicycle physics & drift model
    │   ├── sensors.js          # LIDAR 7-ray continuous raycasting
    │   └── particles.js        # Skid marks, tire smoke, sparks, lap confetti
    ├── ai/
    │   ├── neuralNetwork.js    # MLP feedforward, Xavier init, crossover, mutation
    │   ├── geneticAlgorithm.js # Swarm population manager, elitism, reproduction
    │   └── presets.js          # Calibrated champion weights (Apex Hunter, Drift)
    ├── track/
    │   ├── spatialIndex.js     # 2D Spatial Hash Grid for fast raycasting/collision
    │   ├── tracks.js           # Challenging track definitions & control points
    │   ├── trackBuilder.js     # Catmull-Rom closed splines, boundaries, checkpoints
    │   └── obstacles.js        # Dynamic moving hazard pylons
    ├── visualizer/
    │   ├── trackRenderer.js    # Offscreen-cached canvas renderer with smooth camera
    │   ├── brainVisualizer.js  # Live neural network synapse & node HUD
    │   └── chartVisualizer.js  # Real-time generation fitness progression curve
    └── audio/
        └── soundEngine.js      # Procedural Web Audio synthesizer (zero assets needed)
```
