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
   * Evolution process: Elitism, Selection, Crossover & Mutation
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

    // Compute elite count (preserve top 10%, at least 2 cars)
    const eliteCount = Math.max(2, Math.floor(this.populationSize * CONFIG.ELITISM_PERCENT));
    const newBrains = [];

    // 1. Elitism: preserve top performers directly without mutation
    for (let i = 0; i < eliteCount; i++) {
      newBrains.push(this.population[i].brain.clone());
    }

    // 2. Reproduction: Tournament selection + Crossover + Mutation
    while (newBrains.length < this.populationSize) {
      const parentA = this.tournamentSelect();
      const parentB = this.tournamentSelect();

      let childBrain;
      if (Math.random() < 0.75) {
        // Crossover
        childBrain = parentA.brain.crossover(parentB.brain);
      } else {
        childBrain = parentA.brain.clone();
      }

      // Mutate
      childBrain.mutate(this.mutationRate, this.mutationStrength);
      newBrains.push(childBrain);
    }

    // 3. Reset starting grid positions
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
  tournamentSelect(k = CONFIG.TOURNAMENT_SIZE) {
    let best = null;
    for (let i = 0; i < k; i++) {
      const randIdx = Math.floor(Math.random() * this.population.length);
      const candidate = this.population[randIdx];
      if (!best || candidate.fitness > best.fitness) {
        best = candidate;
      }
    }
    return best;
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
