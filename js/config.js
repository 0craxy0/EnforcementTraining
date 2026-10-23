/**
 * Global Configuration and Constants for Enforcement Training Visualization
 */
export const CONFIG = {
  // Simulation & Timing
  FPS: 60,
  DEFAULT_SPEED_MULTIPLIER: 1,
  MAX_SPEED_MULTIPLIER: 10,
  GENERATION_TIMEOUT_SECONDS: 50, // Auto-terminate generation if stuck
  STALL_TIMEOUT_FRAMES: 500, // Kill car if it makes no forward progress in ~8.3s

  // Population & Evolution Defaults
  DEFAULT_POPULATION_SIZE: 40,
  MIN_POPULATION_SIZE: 5,
  MAX_POPULATION_SIZE: 150,
  DEFAULT_MUTATION_RATE: 0.12, // 12% chance per weight
  DEFAULT_MUTATION_STRENGTH: 0.25, // Gaussian perturbation standard deviation
  ELITISM_PERCENT: 0.10, // Top 10% kept untouched
  TOURNAMENT_SIZE: 4,

  // Car Physics
  CAR: {
    WIDTH: 18,
    LENGTH: 36,
    MAX_SPEED: 7.2,
    REVERSE_MAX_SPEED: -2.0,
    ACCELERATION: 0.24,
    BRAKE_FORCE: 0.38,
    FRICTION: 0.980, // Longitudinal drag
    LATERAL_GRIP: 0.88, // Drift slip ratio
    TURN_SPEED: 0.068, // Max angular turn per frame at optimal speed
    MIN_TURN_SPEED_FACTOR: 0.30, // Reduced turning when barely moving
  },

  // Sensor Array (LIDAR)
  SENSORS: {
    RAY_COUNT: 7, // 7 rays: -65°, -45°, -20°, 0°, +20°, +45°, +65°
    RAY_ANGLES: [
      -Math.PI * 0.38, // -68°
      -Math.PI * 0.22, // -40°
      -Math.PI * 0.10, // -18°
      0,               // 0° (Straight ahead)
      Math.PI * 0.10,  // +18°
      Math.PI * 0.22,  // +40°
      Math.PI * 0.38,  // +68°
    ],
    RAY_LENGTH: 190,
  },

  // Neural Network Architecture
  NETWORK: {
    // Inputs: 7 rays + current speed + relative angle to next checkpoint + lateral velocity = 10 inputs
    INPUT_SIZE: 10,
    HIDDEN_LAYERS: [12, 8],
    // Outputs: [Throttle/Brake (-1 to 1), Steering (-1 to 1), Drift/Handbrake (0 to 1)]
    OUTPUT_SIZE: 3,
  },

  // Visuals & Themes (Default: shadcn/ui Zinc)
  THEMES: {
    SHADCN_ZINC: {
      name: 'shadcn/ui Zinc',
      background: '#09090b',
      gridColor: 'rgba(255, 255, 255, 0.035)',
      asphalt: '#121215',
      asphaltEdge: '#27272a',
      barrier: '#fafafa',
      barrierGlow: 'rgba(250, 250, 250, 0.22)',
      curbRed: '#ef4444',
      curbWhite: '#71717a',
      checkpoint: 'rgba(250, 250, 250, 0.18)',
      finishLine: '#fafafa',
      leaderCar: '#fafafa',
      humanCar: '#10b981',
      carColors: [
        '#e4e4e7', '#a1a1aa', '#38bdf8', '#818cf8',
        '#f472b6', '#34d399', '#fbbf24', '#f87171'
      ]
    },
    CYBERPUNK: {
      name: 'Cyberpunk Neon',
      background: '#070a13',
      gridColor: 'rgba(0, 240, 255, 0.04)',
      asphalt: '#0d1322',
      asphaltEdge: '#162035',
      barrier: '#00f0ff',
      barrierGlow: 'rgba(0, 240, 255, 0.45)',
      curbRed: '#ff0055',
      curbWhite: '#e2e8f0',
      checkpoint: 'rgba(0, 240, 255, 0.25)',
      finishLine: '#ffb700',
      leaderCar: '#ffb700',
      humanCar: '#00ff88',
      carColors: [
        '#00f0ff', '#7000ff', '#ff007f', '#00ffaa', 
        '#3a86ff', '#ffbe0b', '#fb5607', '#8338ec'
      ]
    }
  }
};
