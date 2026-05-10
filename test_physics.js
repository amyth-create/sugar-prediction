const fs = require('fs');

// Load physics
const physicsCode = fs.readFileSync('physics.js', 'utf8');
eval(physicsCode);

// Mock data that is collinear
const vdFitDataSingular = [
    { u: 0.833, H: 0.005 },
    { u: 0.833, H: 0.005 },
    { u: 0.833, H: 0.005 }
];
console.log("Singular fit:", window.HPLCPhysics.fitVanDeemter(vdFitDataSingular));

// Mock data that is valid
const vdFitDataValid = [
    { u: 0.833, H: 0.005 },
    { u: 1.666, H: 0.008 },
    { u: 0.416, H: 0.006 }
];
console.log("Valid fit:", window.HPLCPhysics.fitVanDeemter(vdFitDataValid));
