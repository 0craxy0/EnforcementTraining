/**
 * Circuit Layouts and Presets
 */
export const TRACK_PRESETS = [
  {
    id: 'serpent',
    name: "The Serpent's Coil",
    description: "Technical hairpins, decreasing radius bends, and narrowing chicanes.",
    difficulty: "Hard",
    defaultWidth: 80,
    controlPoints: [
      { x: 450, y: 700, width: 85 },  // Start / Finish straight
      { x: 800, y: 700, width: 85 },
      { x: 1050, y: 640, width: 80 },
      { x: 1200, y: 480, width: 75 }, // First sweeper
      { x: 1100, y: 320, width: 70 }, // Severe hairpin entry
      { x: 880, y: 300, width: 68 },  // Tight hairpin apex
      { x: 740, y: 420, width: 70 },  // Hairpin exit
      { x: 620, y: 460, width: 65 },  // Chicane left
      { x: 500, y: 360, width: 65 },  // Chicane right
      { x: 400, y: 220, width: 70 },  // Sweeper up
      { x: 260, y: 180, width: 75 },  // Top hairpin
      { x: 160, y: 300, width: 75 },
      { x: 200, y: 480, width: 80 },  // Downhill curve
      { x: 250, y: 650, width: 85 },  // Entry back to main straight
    ]
  },
  {
    id: 'apex',
    name: "Suzuka Apex Gauntlet",
    description: "High-speed sweeping esses, double-apex hairpin, and a technical final chicane.",
    difficulty: "Expert",
    defaultWidth: 82,
    controlPoints: [
      { x: 500, y: 720, width: 90 }, // Start straight
      { x: 850, y: 720, width: 88 },
      { x: 1120, y: 650, width: 82 },
      { x: 1220, y: 460, width: 78 },
      { x: 1050, y: 280, width: 72 }, // Esses bend 1
      { x: 920, y: 380, width: 70 },  // Esses bend 2
      { x: 780, y: 240, width: 70 },  // Esses bend 3
      { x: 600, y: 200, width: 75 },
      { x: 380, y: 240, width: 75 },  // Spoon curve entry
      { x: 200, y: 340, width: 70 },  // Spoon apex
      { x: 160, y: 520, width: 78 },
      { x: 300, y: 600, width: 72 },  // Final chicane entry
      { x: 350, y: 680, width: 85 }   // Final chicane exit to straight
    ]
  },
  {
    id: 'cyberpunk',
    name: "Neon Metropolis 2088",
    description: "Urban street circuit with 90° urban corners, long high-speed tunnel, and narrow bridges.",
    difficulty: "Medium",
    defaultWidth: 85,
    controlPoints: [
      { x: 500, y: 750, width: 90 },
      { x: 950, y: 750, width: 90 },
      { x: 1150, y: 680, width: 85 },
      { x: 1200, y: 400, width: 80 },
      { x: 1150, y: 180, width: 80 },
      { x: 800, y: 150, width: 75 },
      { x: 550, y: 220, width: 75 },
      { x: 400, y: 350, width: 70 },
      { x: 320, y: 220, width: 75 },
      { x: 180, y: 240, width: 80 },
      { x: 150, y: 550, width: 85 },
      { x: 300, y: 720, width: 85 }
    ]
  },
  {
    id: 'oval',
    name: "Daytona Oval Warmup",
    description: "Fast banked tri-oval for quick evolution testing and baseline verification.",
    difficulty: "Easy",
    defaultWidth: 95,
    controlPoints: [
      { x: 400, y: 700, width: 95 },
      { x: 900, y: 700, width: 95 },
      { x: 1200, y: 550, width: 95 },
      { x: 1200, y: 350, width: 95 },
      { x: 900, y: 200, width: 95 },
      { x: 400, y: 200, width: 95 },
      { x: 180, y: 350, width: 95 },
      { x: 180, y: 550, width: 95 }
    ]
  }
];
