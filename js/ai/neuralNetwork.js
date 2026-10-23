/**
 * Multi-Layer Perceptron (MLP) Neural Network for Agent Brains
 */
export class NeuralNetwork {
  constructor(inputNodes, hiddenLayers, outputNodes) {
    this.inputNodes = inputNodes;
    this.hiddenLayers = [...hiddenLayers];
    this.outputNodes = outputNodes;

    // Topology: e.g. [10, 12, 8, 3]
    this.layerSizes = [inputNodes, ...hiddenLayers, outputNodes];
    this.numLayers = this.layerSizes.length;

    // Weights: weights[l] has shape [layerSizes[l+1]][layerSizes[l]]
    this.weights = [];
    // Biases: biases[l] has shape [layerSizes[l+1]]
    this.biases = [];

    // Cached node activations using Float32Arrays for zero GC allocation during feedforward
    this.activations = this.layerSizes.map(size => new Float32Array(size));

    this.initializeWeights();
  }

  /**
   * Xavier/Glorot weight initialization
   */
  initializeWeights() {
    this.weights = [];
    this.biases = [];

    for (let l = 0; l < this.numLayers - 1; l++) {
      const inSize = this.layerSizes[l];
      const outSize = this.layerSizes[l + 1];
      const scale = Math.sqrt(2.0 / (inSize + outSize));

      const layerWeights = [];
      for (let j = 0; j < outSize; j++) {
        const row = new Float32Array(inSize);
        for (let i = 0; i < inSize; i++) {
          row[i] = this.randomGaussian() * scale;
        }
        layerWeights.push(row);
      }
      this.weights.push(layerWeights);

      // Biases initialized with small values
      const layerBiases = new Float32Array(outSize);
      for (let j = 0; j < outSize; j++) {
        layerBiases[j] = (Math.random() * 2 - 1) * 0.1;
      }
      this.biases.push(layerBiases);
    }
  }

  /**
   * Box-Muller Gaussian random generator
   */
  randomGaussian() {
    let u1 = 0, u2 = 0;
    while (u1 === 0) u1 = Math.random();
    while (u2 === 0) u2 = Math.random();
    return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  }

  /**
   * High-Performance forward pass (Zero heap allocation)
   * @param {ArrayLike<number>} inputs - input features
   * @returns {Float32Array} outputs
   */
  predict(inputs) {
    const act0 = this.activations[0];
    const inCount = this.inputNodes;
    for (let i = 0; i < inCount; i++) {
      act0[i] = inputs[i] || 0;
    }

    const numLayersMinus1 = this.numLayers - 1;

    for (let l = 0; l < numLayersMinus1; l++) {
      const current = this.activations[l];
      const next = this.activations[l + 1];
      const outSize = this.layerSizes[l + 1];
      const inSize = this.layerSizes[l];
      const weightsLayer = this.weights[l];
      const biasesLayer = this.biases[l];
      const isLastLayer = (l === numLayersMinus1 - 1);

      for (let j = 0; j < outSize; j++) {
        let sum = biasesLayer[j];
        const row = weightsLayer[j];
        for (let i = 0; i < inSize; i++) {
          sum += row[i] * current[i];
        }

        if (!isLastLayer) {
          next[j] = Math.tanh(sum);
        } else {
          if (j === 2) {
            next[j] = 1 / (1 + Math.exp(-sum)); // Drift sigmoid
          } else {
            next[j] = Math.tanh(sum); // Throttle & Steer tanh
          }
        }
      }
    }

    return this.activations[this.numLayers - 1];
  }

  /**
   * Mutates weights and biases with Gaussian perturbation
   * @param {number} rate - probability of mutating each weight (0 - 1)
   * @param {number} strength - magnitude of perturbation
   */
  mutate(rate = 0.1, strength = 0.25) {
    for (let l = 0; l < this.weights.length; l++) {
      const outSize = this.layerSizes[l + 1];
      const inSize = this.layerSizes[l];

      for (let j = 0; j < outSize; j++) {
        // Mutate bias
        if (Math.random() < rate) {
          this.biases[l][j] += this.randomGaussian() * strength;
          // Clamp bias to reasonable bounds
          this.biases[l][j] = Math.max(-3, Math.min(3, this.biases[l][j]));
        }

        // Mutate weights
        for (let i = 0; i < inSize; i++) {
          if (Math.random() < rate) {
            // 5% chance of complete reset, otherwise perturb
            if (Math.random() < 0.05) {
              this.weights[l][j][i] = this.randomGaussian() * 0.8;
            } else {
              this.weights[l][j][i] += this.randomGaussian() * strength;
            }
            this.weights[l][j][i] = Math.max(-5, Math.min(5, this.weights[l][j][i]));
          }
        }
      }
    }
  }

  /**
   * Clones the network
   */
  clone() {
    const cloneNet = new NeuralNetwork(this.inputNodes, this.hiddenLayers, this.outputNodes);
    for (let l = 0; l < this.weights.length; l++) {
      for (let j = 0; j < this.weights[l].length; j++) {
        cloneNet.biases[l][j] = this.biases[l][j];
        for (let i = 0; i < this.weights[l][j].length; i++) {
          cloneNet.weights[l][j][i] = this.weights[l][j][i];
        }
      }
    }
    return cloneNet;
  }

  /**
   * Performs uniform crossover with another neural network
   * @param {NeuralNetwork} partner
   * @returns {NeuralNetwork} child
   */
  crossover(partner) {
    const child = new NeuralNetwork(this.inputNodes, this.hiddenLayers, this.outputNodes);

    for (let l = 0; l < this.weights.length; l++) {
      for (let j = 0; j < this.weights[l].length; j++) {
        child.biases[l][j] = Math.random() < 0.5 ? this.biases[l][j] : partner.biases[l][j];
        for (let i = 0; i < this.weights[l][j].length; i++) {
          child.weights[l][j][i] = Math.random() < 0.5 ? this.weights[l][j][i] : partner.weights[l][j][i];
        }
      }
    }

    return child;
  }

  /**
   * Serializes model weights to a JSON object
   */
  toJSON() {
    return {
      inputNodes: this.inputNodes,
      hiddenLayers: this.hiddenLayers,
      outputNodes: this.outputNodes,
      layerSizes: this.layerSizes,
      weights: this.weights,
      biases: this.biases,
    };
  }

  /**
   * Deserializes from JSON object
   */
  static fromJSON(data) {
    const net = new NeuralNetwork(data.inputNodes, data.hiddenLayers, data.outputNodes);
    net.weights = JSON.parse(JSON.stringify(data.weights));
    net.biases = JSON.parse(JSON.stringify(data.biases));
    return net;
  }
}
