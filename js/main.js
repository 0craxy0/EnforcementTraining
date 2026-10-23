/**
 * Main Application Orchestrator for NEURO-DRIFT
 */
import { CONFIG } from './config.js';
import { TRACK_PRESETS } from './track/tracks.js';
import { TrackBuilder } from './track/trackBuilder.js';
import { DynamicObstacle } from './track/obstacles.js';
import { ParticleSystem } from './physics/particles.js';
import { SoundEngine } from './audio/soundEngine.js';
import { GeneticAlgorithm } from './ai/geneticAlgorithm.js';
import { BrainPresets } from './ai/presets.js';
import { TrackRenderer } from './visualizer/trackRenderer.js';
import { BrainVisualizer } from './visualizer/brainVisualizer.js';
import { ChartVisualizer } from './visualizer/chartVisualizer.js';

class App {
  constructor() {
    // DOM Canvases
    this.canvas = document.getElementById('track-canvas');
    this.brainCanvas = document.getElementById('brain-canvas');
    this.chartCanvas = document.getElementById('chart-canvas');

    // State
    this.isRunning = true;
    this.speedMultiplier = CONFIG.DEFAULT_SPEED_MULTIPLIER;
    this.currentTrackPreset = TRACK_PRESETS[0];
    this.currentTrack = null;
    this.obstacles = [];
    this.hasObstacles = false;

    // Subsystems
    this.particles = new ParticleSystem();
    this.sound = new SoundEngine();
    this.trackRenderer = new TrackRenderer(this.canvas);
    this.brainVisualizer = new BrainVisualizer(this.brainCanvas);
    this.chartVisualizer = new ChartVisualizer(this.chartCanvas);

    // Human controls state
    this.humanKeys = {
      up: false,
      down: false,
      left: false,
      right: false,
      drift: false
    };

    // Cached DOM references to prevent querySelector/getElementById layout thrashing
    this.dom = {
      statGen: document.getElementById('stat-gen'),
      statAlive: document.getElementById('stat-alive'),
      statLaps: document.getElementById('stat-laps'),
      statBestFitness: document.getElementById('stat-best-fitness'),
      statBestLap: document.getElementById('stat-best-lap'),
      hudSpeed: document.getElementById('hud-speed'),
      hudCheckpoints: document.getElementById('hud-checkpoints'),
      hudSteer: document.getElementById('hud-steer'),
      hudLapProgress: document.getElementById('hud-lap-progress'),
      hudProgressPercent: document.getElementById('hud-progress-percent'),
      sidebarRight: document.getElementById('sidebar-right'),
    };
    this.hudFrameCount = 0;

    this.init();
  }

  init() {
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    // Build default track
    this.loadTrack(this.currentTrackPreset);

    // Initialize Genetic Algorithm
    this.ga = new GeneticAlgorithm(this.currentTrack, this.particles, this.sound);

    // Bind UI controls & keyboard
    this.bindUI();
    this.bindKeyboard();

    // Fit camera view
    setTimeout(() => {
      this.trackRenderer.fitToTrack(this.currentTrack);
    }, 50);

    // Show initial welcome toast
    this.showToast("🚀 Swarm initialized! AI learning circuit path.");

    // Start main loop
    requestAnimationFrame((ts) => this.loop(ts));
  }

  /**
   * Resize main simulation canvas to full viewport container
   */
  resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.parentElement.getBoundingClientRect();

    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;

    // Scale canvas context
    const ctx = this.canvas.getContext('2d');
    ctx.resetTransform();
    ctx.scale(dpr, dpr);

    // High-DPI support for HUD canvases
    this.setupHighDPICanvas(this.brainCanvas, 290, 200);
    this.setupHighDPICanvas(this.chartCanvas, 290, 150);

    if (this.currentTrack) {
      this.trackRenderer.fitToTrack(this.currentTrack);
    }
  }

  setupHighDPICanvas(canvas, cssW, cssH) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    const ctx = canvas.getContext('2d');
    ctx.resetTransform();
    ctx.scale(dpr, dpr);
  }

  /**
   * Load track layout and rebuild geometry
   */
  loadTrack(trackPreset) {
    this.currentTrackPreset = trackPreset;
    this.currentTrack = TrackBuilder.buildTrack(
      trackPreset.controlPoints,
      trackPreset.defaultWidth,
      28,
      60
    );

    // Initialize persistent skid buffer sized to circuit bounds
    const b = this.currentTrack.bounds;
    this.particles.initSkidBuffer(
      Math.ceil(b.maxX + 200),
      Math.ceil(b.maxY + 200)
    );

    this.buildObstacles();

    if (this.ga) {
      this.ga.reset(this.currentTrack);
    }

    this.trackRenderer.fitToTrack(this.currentTrack);
  }

  /**
   * Spawn dynamic moving hazard pylons
   */
  buildObstacles() {
    this.obstacles = [];
    if (!this.hasObstacles || !this.currentTrack) return;

    const cps = this.currentTrack.checkpoints;
    if (cps.length > 8) {
      // Place dynamic obstacles across various sectors
      const idx1 = Math.floor(cps.length * 0.35);
      const idx2 = Math.floor(cps.length * 0.7);

      const cp1 = cps[idx1];
      const cp2 = cps[idx2];

      this.obstacles.push(new DynamicObstacle(cp1.center.x, cp1.center.y, 11, 24, 0.04, 'x'));
      this.obstacles.push(new DynamicObstacle(cp2.center.x, cp2.center.y, 11, 24, 0.05, 'y'));
    }
  }

  /**
   * Bind DOM event listeners and sliders
   */
  bindUI() {
    // 1. Play / Pause
    const btnPlayPause = document.getElementById('btn-play-pause');
    const labelPlayPause = document.getElementById('label-play-pause');
    const iconPlayPause = document.getElementById('icon-play-pause');

    btnPlayPause.addEventListener('click', () => {
      this.isRunning = !this.isRunning;
      labelPlayPause.textContent = this.isRunning ? 'Pause' : 'Resume';
      iconPlayPause.innerHTML = this.isRunning
        ? `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="4" height="16" x="6" y="4"/><rect width="4" height="16" x="14" y="4"/></svg>`
        : `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 20 12 6 21 6 3"/></svg>`;
      btnPlayPause.classList.toggle('btn-primary', this.isRunning);
      btnPlayPause.classList.toggle('btn-secondary', !this.isRunning);
    });

    // 2. Speed Selector buttons
    const speedButtons = document.querySelectorAll('.btn-speed');
    speedButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        speedButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.speedMultiplier = parseInt(btn.dataset.speed, 10);
        this.showToast(`Simulation speed: ${this.speedMultiplier}X`);
      });
    });

    // 3. Next Generation button
    document.getElementById('btn-next-gen').addEventListener('click', () => {
      this.ga.forceNextGeneration();
      this.showToast(`Generation advanced to ${this.ga.generation}`);
    });

    // 4. Sound Mute button
    const btnMute = document.getElementById('btn-mute');
    const iconSound = document.getElementById('icon-sound');
    btnMute.addEventListener('click', () => {
      const isMuted = this.sound.toggleMute();
      iconSound.innerHTML = isMuted
        ? `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/></svg>`
        : `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`;
      this.showToast(isMuted ? 'Audio muted' : 'Audio enabled');
    });

    // 5. Cinema Mode / Toggle Sidebars
    document.getElementById('btn-toggle-panels').addEventListener('click', () => {
      const left = document.getElementById('sidebar-left');
      const right = document.getElementById('sidebar-right');
      const isCollapsed = left.classList.contains('collapsed-left');

      left.classList.toggle('collapsed-left', !isCollapsed);
      right.classList.toggle('collapsed-right', !isCollapsed);
    });

    document.getElementById('btn-collapse-left').addEventListener('click', () => {
      document.getElementById('sidebar-left').classList.add('collapsed-left');
    });

    document.getElementById('btn-collapse-right').addEventListener('click', () => {
      document.getElementById('sidebar-right').classList.add('collapsed-right');
    });

    // 6. Population Slider
    const sliderPop = document.getElementById('slider-population');
    const badgePop = document.getElementById('val-pop-badge');
    sliderPop.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      badgePop.textContent = `${val} CARS`;
      this.ga.setPopulationSize(val);
    });

    // 7. Mutation Rate & Strength Sliders
    const sliderMut = document.getElementById('slider-mutation');
    const badgeMut = document.getElementById('val-mutation-badge');
    sliderMut.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      badgeMut.textContent = `${val}%`;
      this.ga.mutationRate = val / 100;
    });

    const sliderStr = document.getElementById('slider-strength');
    const badgeStr = document.getElementById('val-strength-badge');
    sliderStr.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      badgeStr.textContent = val.toFixed(2);
      this.ga.mutationStrength = val;
    });

    // 8. Circuit Track Selector
    const selectTrack = document.getElementById('select-track');
    selectTrack.addEventListener('change', (e) => {
      const presetId = e.target.value;
      const found = TRACK_PRESETS.find(p => p.id === presetId) || TRACK_PRESETS[0];
      this.loadTrack(found);
      this.showToast(`Loaded Circuit: ${found.name}`);
    });

    // 9. Obstacles Checkbox
    const checkObs = document.getElementById('check-obstacles');
    checkObs.addEventListener('change', (e) => {
      this.hasObstacles = e.target.checked;
      this.buildObstacles();
      this.showToast(this.hasObstacles ? "⚠️ Dynamic hazard pylons active" : "Hazard pylons cleared");
    });

    // 10. AI Model Benchmark Presets & Swarm Sync
    const btnSyncSmartest = document.getElementById('btn-sync-smartest');
    if (btnSyncSmartest) {
      btnSyncSmartest.addEventListener('click', () => {
        const res = this.ga.syncSwarmToSmartest({ respawn: true });
        if (res) {
          this.showToast(`⚡ Swarm synchronized to Smartest AI (${res.source})!`);
        } else {
          this.showToast("No trained AI leader found yet");
        }
      });
    }

    document.getElementById('preset-master').addEventListener('click', () => {
      const masterBrain = BrainPresets.getApexHunter();
      this.ga.loadBrain(masterBrain);
      this.showToast("🏆 Apex Hunter Champion Weights Loaded!");
    });

    document.getElementById('preset-drift').addEventListener('click', () => {
      const driftBrain = BrainPresets.getDriftSpecialist();
      this.ga.loadBrain(driftBrain);
      this.showToast("⚡ Drift Specialist Weights Loaded!");
    });

    document.getElementById('preset-reset').addEventListener('click', () => {
      this.ga.reset(this.currentTrack);
      this.showToast("↺ Swarm Reset: Learning from Gen 1 scratch");
    });

    // 11. Export / Import Model
    document.getElementById('btn-save-model').addEventListener('click', () => {
      const targetBrain = this.ga.bestCarAllTime ? this.ga.bestCarAllTime.brain : (this.ga.currentLeader ? this.ga.currentLeader.brain : null);
      if (!targetBrain) {
        this.showToast("No trained model to export yet");
        return;
      }
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(targetBrain.toJSON(), null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `neuro_drift_gen${this.ga.generation}_model.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      this.showToast("Model downloaded as JSON");
    });

    const fileInput = document.getElementById('file-import');
    document.getElementById('btn-load-model').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const json = JSON.parse(evt.target.result);
          this.ga.loadBrain(json);
          this.showToast("Custom model successfully imported!");
        } catch (err) {
          this.showToast("Error parsing model JSON file");
        }
      };
      reader.readAsText(file);
    });

    // 12. Challenger Human Mode
    const checkHuman = document.getElementById('check-human-car');
    checkHuman.addEventListener('change', (e) => {
      if (e.target.checked) {
        this.ga.spawnHumanCar();
        this.showToast("🏎️ P1 Challenger Active! Use WASD to race!");
      } else {
        this.ga.removeHumanCar();
        this.showToast("Challenger car removed");
      }
    });

    // 13. Camera Dock buttons
    const cameraButtons = document.querySelectorAll('[data-camera]');
    cameraButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        cameraButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.trackRenderer.camera.mode = btn.dataset.camera;
        if (btn.dataset.camera === 'overview') {
          this.trackRenderer.fitToTrack(this.currentTrack);
        }
      });
    });

    // 14. Lidar Ray Dock buttons
    const rayButtons = document.querySelectorAll('[data-rays]');
    rayButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        rayButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.trackRenderer.showSensors = btn.dataset.rays;
      });
    });

    // 15. Center View button
    document.getElementById('btn-fit-view').addEventListener('click', () => {
      this.trackRenderer.fitToTrack(this.currentTrack);
      cameraButtons.forEach(b => b.classList.toggle('active', b.dataset.camera === 'overview'));
    });
  }

  /**
   * Bind Keyboard inputs for simulation shortcuts & Human player driving
   */
  bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      // Space: Toggle Play/Pause or Drift if Human
      if (e.code === 'Space') {
        if (this.ga.humanDriveEnabled && this.ga.humanCar && this.ga.humanCar.isAlive) {
          this.humanKeys.drift = true;
          e.preventDefault();
        } else {
          document.getElementById('btn-play-pause').click();
          e.preventDefault();
        }
      }

      // 'N': Force Next Generation
      if (e.key === 'n' || e.key === 'N') {
        document.getElementById('btn-next-gen').click();
      }

      // 'C': Center View
      if (e.key === 'c' || e.key === 'C') {
        document.getElementById('btn-fit-view').click();
      }

      // 'S': Sync Swarm to Smartest (when Human racer is not using S for braking)
      if ((e.key === 's' || e.key === 'S') && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (!this.ga.humanDriveEnabled) {
          const btnSync = document.getElementById('btn-sync-smartest');
          if (btnSync) btnSync.click();
          e.preventDefault();
        }
      }

      // Human Driving Keys (WASD / Arrows)
      if (e.code === 'KeyW' || e.code === 'ArrowUp') this.humanKeys.up = true;
      if (e.code === 'KeyS' || e.code === 'ArrowDown') this.humanKeys.down = true;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') this.humanKeys.left = true;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') this.humanKeys.right = true;
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'KeyW' || e.code === 'ArrowUp') this.humanKeys.up = false;
      if (e.code === 'KeyS' || e.code === 'ArrowDown') this.humanKeys.down = false;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') this.humanKeys.left = false;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') this.humanKeys.right = false;
      if (e.code === 'Space') this.humanKeys.drift = false;
    });
  }

  /**
   * Update Human player car controls from keyboard state
   */
  updateHumanInput() {
    if (!this.ga.humanDriveEnabled || !this.ga.humanCar || !this.ga.humanCar.isAlive) return;

    let throttle = 0;
    let steering = 0;

    if (this.humanKeys.up) throttle += 1;
    if (this.humanKeys.down) throttle -= 1;
    if (this.humanKeys.left) steering -= 1;
    if (this.humanKeys.right) steering += 1;

    this.ga.humanCar.controls.throttle = throttle;
    this.ga.humanCar.controls.steering = steering;
    this.ga.humanCar.controls.drift = this.humanKeys.drift;
  }

  /**
   * Main game loop running at up to 60fps
   */
  loop() {
    if (this.isRunning) {
      // Step simulation multiple times according to speedMultiplier
      for (let s = 0; s < this.speedMultiplier; s++) {
        this.updateHumanInput();

        // Update obstacles
        const numObs = this.obstacles.length;
        for (let i = 0; i < numObs; i++) {
          this.obstacles[i].update();
        }

        // Update GA Swarm
        this.lastStats = this.ga.update(this.obstacles);
        this.particles.update();
      }
    }

    // Camera follow update
    const targetCar = (this.trackRenderer.camera.mode === 'followHuman' && this.ga.humanCar)
      ? this.ga.humanCar
      : this.ga.currentLeader;

    this.trackRenderer.updateCamera(targetCar, this.currentTrack);

    // Render Circuit & Swarm
    this.trackRenderer.render(
      this.currentTrack,
      this.ga.population,
      this.particles,
      this.obstacles,
      this.ga.currentLeader,
      this.ga.humanCar
    );

    this.hudFrameCount++;

    // Throttle DOM text updates to 15 FPS (every 4th frame) to eliminate layout thrashing
    if (this.hudFrameCount % 4 === 0) {
      this.updateHUD();
    }

    // Only render secondary HUD canvases (brain & chart) if inspector sidebar is visible
    const isRightOpen = !this.dom.sidebarRight.classList.contains('collapsed-right');
    if (isRightOpen && this.hudFrameCount % 2 === 0) {
      if (this.ga.currentLeader && this.ga.currentLeader.brain) {
        this.brainVisualizer.draw(this.ga.currentLeader.brain);
      }
      this.chartVisualizer.draw(this.ga.history);
    }

    requestAnimationFrame(() => this.loop());
  }

  /**
   * Update DOM stats and telemetry gauges using cached DOM elements
   */
  updateHUD() {
    if (!this.lastStats) return;
    const dom = this.dom;

    // Header stats
    dom.statGen.textContent = this.lastStats.generation;
    dom.statAlive.textContent = `${this.lastStats.aliveCount} / ${this.lastStats.totalCars}`;
    dom.statLaps.textContent = this.lastStats.totalLapsEver;
    dom.statBestFitness.textContent = Math.round(this.lastStats.bestFitnessAllTime || 0);

    const bestLapTime = this.lastStats.bestLapTime;
    dom.statBestLap.textContent =
      (bestLapTime && bestLapTime !== Infinity) ? `${bestLapTime.toFixed(2)}s` : '--:--';

    // Auto-breakthrough sync notification
    if (this.ga.lastBreakthroughSync && !this.ga.lastBreakthroughSync.notified) {
      this.ga.lastBreakthroughSync.notified = true;
      this.showToast(`⚡ Breakthrough! Swarm auto-synced to Smartest AI (${this.ga.lastBreakthroughSync.ratio}x Fitness)`);
    }

    // Right Sidebar Leader HUD
    const leader = this.ga.currentLeader;
    if (leader) {
      dom.hudSpeed.textContent = Math.abs(leader.speed).toFixed(1);
      dom.hudCheckpoints.textContent = leader.checkpointsCrossed;
      dom.hudSteer.textContent = `${(leader.controls.steering * 35).toFixed(0)}°`;

      if (this.currentTrack && this.currentTrack.checkpoints) {
        const totalGates = this.currentTrack.checkpoints.length;
        const gateIdx = leader.nextCheckpointIndex;
        const pct = Math.round((gateIdx / totalGates) * 100);
        dom.hudLapProgress.style.width = `${pct}%`;
        dom.hudProgressPercent.textContent = `${pct}%`;
      }
    }
  }

  /**
   * Display floating notification toast
   */
  showToast(message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode === container) {
        container.removeChild(toast);
      }
    }, 3000);
  }
}

// Start application when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  new App();
});
