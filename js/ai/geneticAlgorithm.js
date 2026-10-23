/**
 * Genetic Algorithm & Population Evolution Manager
 */
import { CONFIG } from '../config.js';
import { Car } from '../physics/car.js';
import { TrackBuilder } from '../track/trackBuilder.js';
import { NeuralNetwork } from './neuralNetwork.js';

export class GeneticAlgorithm {
  constructor(track, particleSystem, soundEngine) {
    this.track = track;
    this.particles = particleSystem;
    this.sound = soundEngine;

    this.populationSize = CONFIG.DEFAULT_POPULATION_SIZE;
    this.mutationRate = CONFIG.DEFAULT_MUTATION_RATE;
    this.mutationStrength = CONFIG.DEFAULT_MUTATION_STRENGTH;

    this.population = [];
    this.generation = 1;
    this.generationFrames = 0;
    this.maxGenerationFrames = CONFIG.GENERATION_TIMEOUT_SECONDS * 60;

    // Leader & Record metrics
    this.bestCarAllTime = null;
    this.bestFitnessAllTime = 0;
    this.currentLeader = null;
    this.bestLapTimeAllTime = Infinity;
    this.totalLapsEver = 0;

    // Generation training metrics for live chart
    this.history = []; // [{ gen, maxFitness, avgFitness, laps, bestLapTime }]
    this.lastBreakthroughSync = null;

    // Human player car (optional)
    this.humanCar = null;
    this.humanDriveEnabled = false;

    // Initialize initial population
    this.initPopulation();
  }

  /**
   * Initialize first generation with randomized neural network brains
   */
  initPopulation() {
    this.population = [];
    const gridPositions = TrackBuilder.getStartingGrid(this.track, this.populationSize);

    for (let i = 0; i < this.populationSize; i++) {
      const pos = gridPositions[i] || gridPositions[0];
      const car = new Car(i, pos.x, pos.y, pos.angle);
      this.population.push(car);
    }

    this.currentLeader = this.population[0];
    this.currentLeader.isLeader = true;
  }

  /**
   * Adjust population size dynamically based on user slider
   */
  setPopulationSize(newSize) {
    if (newSize === this.populationSize) return;

    if (newSize > this.populationSize) {
      // Add new cars cloned with mutation from best cars or randomized
      const grid = TrackBuilder.getStartingGrid(this.track, newSize);
      const toAdd = newSize - this.populationSize;
      const bestBrain = this.bestCarAllTime ? this.bestCarAllTime.brain : (this.currentLeader ? this.currentLeader.brain : null);

      for (let i = 0; i < toAdd; i++) {
        const id = this.population.length;
        const pos = grid[id] || grid[0];
        let brain;
        if (bestBrain) {
          brain = bestBrain.clone();
          brain.mutate(this.mutationRate * 1.5, this.mutationStrength);
        }
        const car = new Car(id, pos.x, pos.y, pos.angle, brain);
        this.population.push(car);
      }
    } else {
      // Shrink population
      this.population.length = newSize;
    }

    this.populationSize = newSize;
  }

  /**
   * Main step: update all cars, physics, collision and lap tracking
   */
  update(obstacles = []) {
    this.generationFrames++;

    let aliveCount = 0;
    let highestCurrentFitness = -1;
    let newLeader = null;

    // 1. Update AI swarm
    for (let i = 0; i < this.population.length; i++) {
      const car = this.population[i];

      if (car.isAlive) {
        aliveCount++;
        const prevCrashed = car.isCrashed;
        const prevLaps = car.lapsCompleted;

        car.update(this.track, obstacles, this.sound);

        // Crash event
        if (car.isCrashed && !prevCrashed) {
          this.particles.emitSparks(car.x, car.y, 16);
        }

        // Lap completed event
        if (car.lapsCompleted > prevLaps) {
          this.totalLapsEver++;
          this.particles.emitLapConfetti(car.x, car.y, 90);
          if (car.bestLapTime < this.bestLapTimeAllTime) {
            this.bestLapTimeAllTime = car.bestLapTime;
          }
        }

        // Drifting skid marks & smoke
        if (car.skidding) {
          this.particles.addSkidMark(car.x, car.y, car.angle, 3.5, 0.4);
          this.particles.emitSmoke(car.x, car.y);
        }

        // Find leader of this frame
        if (car.fitness > highestCurrentFitness) {
          highestCurrentFitness = car.fitness;
          newLeader = car;
        }
      }
    }

    // 2. Update leader highlights
    if (newLeader && newLeader !== this.currentLeader) {
      if (this.currentLeader) this.currentLeader.isLeader = false;
      this.currentLeader = newLeader;
      this.currentLeader.isLeader = true;
    }

    // 3. Update human player car if active
    if (this.humanDriveEnabled && this.humanCar && this.humanCar.isAlive) {
      const prevLaps = this.humanCar.lapsCompleted;
      this.humanCar.update(this.track, obstacles, this.sound);

      if (this.humanCar.isCrashed) {
        this.particles.emitSparks(this.humanCar.x, this.humanCar.y, 25);
      }
      if (this.humanCar.lapsCompleted > prevLaps) {
        this.particles.emitLapConfetti(this.humanCar.x, this.humanCar.y, 100);
      }
      if (this.humanCar.skidding) {
        this.particles.addSkidMark(this.humanCar.x, this.humanCar.y, this.humanCar.angle, 4, 0.6);
        this.particles.emitSmoke(this.humanCar.x, this.humanCar.y);
      }
    }

    // 4. Check if generation should end
    // Generation ends if all AI cars have crashed or timeout is reached
    const timedOut = this.generationFrames >= this.maxGenerationFrames;
    if (aliveCount === 0 || timedOut) {
      this.evolveNextGeneration();
    }

    return {
      aliveCount,
      totalCars: this.population.length,
      generation: this.generation,
      highestFitness: highestCurrentFitness,
      bestFitnessAllTime: this.bestFitnessAllTime,
      totalLapsEver: this.totalLapsEver,
      bestLapTime: this.bestLapTimeAllTime
    };
  }

  /**
   * Identifies the highest-performing AI across all-time records and current fleet
   */
  getSmartestAI() {
    let best = null;
    let bestFitness = -Infinity;

    // Check all-time champion record
    if (this.bestCarAllTime && this.bestCarAllTime.brain && this.bestCarAllTime.fitness > 0) {
      best = {
        brain: this.bestCarAllTime.brain,
        fitness: this.bestCarAllTime.fitness,
        source: `Champion (Gen ${this.bestCarAllTime.generation || 1})`,
        laps: 0,
        checkpoints: 0
      };
      bestFitness = this.bestCarAllTime.fitness;
    }

    // Check all cars in current population (alive or crashed)
    for (let i = 0; i < this.population.length; i++) {
      const car = this.population[i];
      if (car.fitness > bestFitness) {
        bestFitness = car.fitness;
        best = {
          brain: car.brain,
          fitness: car.fitness,
          source: `Car #${car.id}`,
          laps: car.lapsCompleted,
          checkpoints: car.checkpointsCrossed
        };
      }
    }

    // Fallback if gen 1 right at the start line
    if (!best || !best.brain) {
      const fallbackCar = this.currentLeader || this.population[0];
      if (fallbackCar) {
        best = {
          brain: fallbackCar.brain,
          fitness: Math.max(0, fallbackCar.fitness),
          source: 'Fleet Leader',
          laps: 0,
          checkpoints: 0
        };
      }
    }

    return best;
  }

  /**
   * Synchronizes the entire swarm to the smartest AI's level
   * Eliminates inferior lines and lifts all agents up to the breakthrough performance
   */
  syncSwarmToSmartest(options = { respawn: true }) {
    const smartest = this.getSmartestAI();
    if (!smartest || !smartest.brain) return null;

    // Keep all-time best updated
    if (!this.bestCarAllTime || smartest.fitness > this.bestFitnessAllTime) {
      this.bestFitnessAllTime = Math.max(smartest.fitness, this.bestFitnessAllTime);
      this.bestCarAllTime = {
        brain: smartest.brain.clone(),
        fitness: smartest.fitness,
        generation: this.generation
      };
    }

    const championBrain = smartest.brain;
    const newBrains = [];

    // Breakthrough Swarm Architecture:
    // 1. Top 20% (min 2, max 10): Exact clones of smartest AI (guaranteed preservation)
    const exactCloneCount = Math.max(2, Math.min(10, Math.floor(this.populationSize * 0.20)));
    for (let i = 0; i < exactCloneCount; i++) {
      newBrains.push(championBrain.clone());
    }

    // 2. Next 55%: Fine-tuned precision variations of smartest AI
    // Gentle mutations explore subtle micro-optimizations (braking points & apex lines)
    const fineTunedCount = Math.floor(this.populationSize * 0.55);
    for (let i = 0; i < fineTunedCount; i++) {
      const brain = championBrain.clone();
      brain.mutate(this.mutationRate * 0.35, this.mutationStrength * 0.30);
      newBrains.push(brain);
    }

    // 3. Remaining 25%: Exploratory variants based on smartest AI foundation
    // Moderate mutations explore alternative overtaking lines while retaining core intelligence
    while (newBrains.length < this.populationSize) {
      const brain = championBrain.clone();
      brain.mutate(this.mutationRate * 0.75, this.mutationStrength * 0.55);
      newBrains.push(brain);
    }

    // Update fleet
    const gridPositions = TrackBuilder.getStartingGrid(this.track, this.populationSize);
    for (let i = 0; i < this.populationSize; i++) {
      const pos = gridPositions[i] || gridPositions[0];
      if (this.population[i]) {
        this.population[i].brain = newBrains[i];
        if (options.respawn) {
          this.population[i].reset(pos.x, pos.y, pos.angle);
        }
      } else {
        const car = new Car(i, pos.x, pos.y, pos.angle, newBrains[i]);
        this.population.push(car);
      }
    }

    if (options.respawn) {
      this.generationFrames = 0;
      this.currentLeader = this.population[0];
      this.currentLeader.isLeader = true;

      // Reset human car if active
      if (this.humanDriveEnabled && this.humanCar) {
        const startPos = gridPositions[0];
        this.humanCar.reset(startPos.x, startPos.y - 12, startPos.angle);
      }

      // Celebratory visual bursts at start grid
      if (gridPositions[0]) {
        this.particles.emitLapConfetti(gridPositions[0].x, gridPositions[0].y, 60);
        this.particles.emitSparks(gridPositions[0].x, gridPositions[0].y, 30);
      }
    }

    return {
      smartestFitness: smartest.fitness,
      source: smartest.source,
      syncedCars: this.populationSize,
      generation: this.generation
    };
  }

  /**
   * Evolution process: Elitism, Selection, Crossover & Mutation
   * Automatically detects if one AI achieved a breakthrough and synchronizes the swarm
   */
  evolveNextGeneration() {
    // Sort cars by fitness descending
    this.population.sort((a, b) => b.fitness - a.fitness);

    const bestOfGen = this.population[0];
    const maxFitness = bestOfGen.fitness;

    let sumFitness = 0;
    let genLaps = 0;
    for (let i = 0; i < this.population.length; i++) {
      sumFitness += this.population[i].fitness;
      genLaps += this.population[i].lapsCompleted;
    }
    const avgFitness = Math.round(sumFitness / this.population.length);
    const medianFitness = this.population[Math.floor(this.population.length / 2)].fitness;

    // Update all-time champion
    if (!this.bestCarAllTime || maxFitness > this.bestFitnessAllTime) {
      this.bestFitnessAllTime = maxFitness;
      this.bestCarAllTime = {
        brain: bestOfGen.brain.clone(),
        fitness: maxFitness,
        generation: this.generation
      };
    }

    // Record generation history for chart
    this.history.push({
      gen: this.generation,
      maxFitness,
      avgFitness,
      laps: genLaps,
      bestLapTime: this.bestLapTimeAllTime === Infinity ? null : this.bestLapTimeAllTime
    });

    // Detect if one AI had a major breakthrough while others lagged behind:
    // 1. Leader fitness is significantly higher than swarm average/median (breakthrough divergence)
    // 2. Leader finished laps while the rest crashed early
    // 3. Current generation struggled but an all-time smart champion exists
    const isLocalBreakthrough = (maxFitness >= 800 && (maxFitness >= avgFitness * 1.70 || maxFitness >= medianFitness * 2.2)) ||
      (bestOfGen.lapsCompleted > 0 && avgFitness < maxFitness * 0.6);
    const isHistoricalBreakthrough = this.bestCarAllTime && this.bestCarAllTime.fitness > 1200 && (this.bestCarAllTime.fitness >= maxFitness * 1.6);
    const shouldBreakthroughSync = isLocalBreakthrough || isHistoricalBreakthrough;

    const newBrains = [];

    if (shouldBreakthroughSync) {
      // SMART BREAKTHROUGH CONVERGENCE:
      // Prevent stupid cars that crashed at turn 1 from diluting the breakthrough!
      const anchorBrain = (isHistoricalBreakthrough && this.bestCarAllTime.fitness > maxFitness)
        ? this.bestCarAllTime.brain
        : bestOfGen.brain;
      const anchorFitness = (isHistoricalBreakthrough && this.bestCarAllTime.fitness > maxFitness)
        ? this.bestCarAllTime.fitness
        : maxFitness;

      // Smart parent candidate pool: only agents within 65% of anchor fitness
      const smartThreshold = anchorFitness * 0.65;
      const smartPool = this.population.filter(c => c.fitness >= smartThreshold);
      if (smartPool.length === 0) {
        smartPool.push({ brain: anchorBrain, fitness: anchorFitness });
      }

      // 1. Exact elite copies of the smart champion(s) (15-20% of fleet)
      const eliteCount = Math.max(2, Math.min(8, Math.floor(this.populationSize * 0.18)));
      for (let i = 0; i < eliteCount; i++) {
        const sourceCandidate = smartPool[i % smartPool.length];
        newBrains.push(sourceCandidate.brain.clone());
      }

      // 2. Precision variations from smart pool (55% of fleet)
      const fineTunedCount = Math.floor(this.populationSize * 0.55);
      for (let i = 0; i < fineTunedCount; i++) {
        let brain;
        if (smartPool.length >= 2 && Math.random() < 0.6) {
          const pA = this.tournamentSelect(2, smartPool);
          const pB = this.tournamentSelect(2, smartPool);
          brain = pA.brain.crossover(pB.brain);
        } else {
          const parent = this.tournamentSelect(2, smartPool);
          brain = parent.brain.clone();
        }
        brain.mutate(this.mutationRate * 0.4, this.mutationStrength * 0.35);
        newBrains.push(brain);
      }

      // 3. Exploratory variants anchored on smart pool (remaining ~25%)
      while (newBrains.length < this.populationSize) {
        const parent = this.tournamentSelect(2, smartPool);
        const brain = parent.brain.clone();
        brain.mutate(this.mutationRate * 0.8, this.mutationStrength * 0.6);
        newBrains.push(brain);
      }

      const ratio = (anchorFitness / Math.max(1, avgFitness)).toFixed(1);
      this.lastBreakthroughSync = {
        generation: this.generation,
        fitness: Math.round(anchorFitness),
        ratio,
        notified: false
      };
    } else {
      // Standard balanced evolutionary reproduction when swarm performance is uniform
      const eliteCount = Math.max(2, Math.floor(this.populationSize * CONFIG.ELITISM_PERCENT));
      for (let i = 0; i < eliteCount; i++) {
        newBrains.push(this.population[i].brain.clone());
      }

      while (newBrains.length < this.populationSize) {
        const parentA = this.tournamentSelect();
        const parentB = this.tournamentSelect();

        let childBrain;
        if (Math.random() < 0.75) {
          childBrain = parentA.brain.crossover(parentB.brain);
        } else {
          childBrain = parentA.brain.clone();
        }

        childBrain.mutate(this.mutationRate, this.mutationStrength);
        newBrains.push(childBrain);
      }
    }

    // Reset starting grid positions
    const gridPositions = TrackBuilder.getStartingGrid(this.track, this.populationSize);
    this.population = [];

    for (let i = 0; i < this.populationSize; i++) {
      const pos = gridPositions[i] || gridPositions[0];
      const car = new Car(i, pos.x, pos.y, pos.angle, newBrains[i]);
      this.population.push(car);
    }

    // Reset human car if enabled
    if (this.humanDriveEnabled && this.humanCar) {
      const startPos = gridPositions[0];
      this.humanCar.reset(startPos.x, startPos.y - 12, startPos.angle);
    }

    this.generation++;
    this.generationFrames = 0;
    this.currentLeader = this.population[0];
    this.currentLeader.isLeader = true;
  }

  /**
   * Tournament Selection: pick k random candidates, return the fittest
   */
  tournamentSelect(k = CONFIG.TOURNAMENT_SIZE, candidatePool = null) {
    const pool = candidatePool || this.population;
    let best = null;
    const count = Math.min(k, pool.length);
    for (let i = 0; i < count; i++) {
      const randIdx = Math.floor(Math.random() * pool.length);
      const candidate = pool[randIdx];
      if (!best || candidate.fitness > best.fitness) {
        best = candidate;
      }
    }
    return best || pool[0];
  }

  /**
   * Force premature generation end (User clicked "Next Gen")
   */
  forceNextGeneration() {
    this.evolveNextGeneration();
  }

  /**
   * Full reset of the evolutionary process
   */
  reset(newTrack = null) {
    if (newTrack) {
      this.track = newTrack;
    }
    this.generation = 1;
    this.generationFrames = 0;
    this.bestCarAllTime = null;
    this.bestFitnessAllTime = 0;
    this.bestLapTimeAllTime = Infinity;
    this.totalLapsEver = 0;
    this.history = [];
    this.lastBreakthroughSync = null;
    this.initPopulation();

    if (this.humanDriveEnabled) {
      this.spawnHumanCar();
    }
  }

  /**
   * Spawns or enables the Human-controlled racer car
   */
  spawnHumanCar() {
    const grid = TrackBuilder.getStartingGrid(this.track, 1);
    const pos = grid[0];
    this.humanCar = new Car(999, pos.x, pos.y - 14, pos.angle, null, '#00ff88');
    this.humanCar.isHuman = true;
    this.humanDriveEnabled = true;
  }

  removeHumanCar() {
    this.humanCar = null;
    this.humanDriveEnabled = false;
  }

  /**
   * Load trained champion model weights into the population
   */
  loadBrain(brainJSON) {
    const loadedBrain = typeof brainJSON === 'string' ? JSON.parse(brainJSON) : brainJSON;
    const grid = TrackBuilder.getStartingGrid(this.track, this.populationSize);
    this.population = [];

    for (let i = 0; i < this.populationSize; i++) {
      const pos = grid[i] || grid[0];
      const brain = NeuralNetwork.fromJSON(loadedBrain);
      // Keep first 3 exact clones, mutate the rest slightly to continue learning
      if (i >= 3) {
        brain.mutate(this.mutationRate * 0.8, this.mutationStrength * 0.5);
      }
      this.population.push(new Car(i, pos.x, pos.y, pos.angle, brain));
    }

    this.currentLeader = this.population[0];
    this.currentLeader.isLeader = true;
  }
}
