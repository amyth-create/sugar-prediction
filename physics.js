// physics.js - HPLC Simulator Math & Physics Engine

// ----- MATRIX MATH HELPERS FOR OLS -----

// Multiply two matrices A (m x n) and B (n x p) -> C (m x p)
function multiplyMatrices(a, b) {
    const aRows = a.length, aCols = a[0].length;
    const bRows = b.length, bCols = b[0].length;
    let m = new Array(aRows);
    for (let r = 0; r < aRows; ++r) {
        m[r] = new Array(bCols);
        for (let c = 0; c < bCols; ++c) {
            m[r][c] = 0;
            for (let i = 0; i < aCols; ++i) {
                m[r][c] += a[r][i] * b[i][c];
            }
        }
    }
    return m;
}

// Transpose matrix A (m x n) -> A^T (n x m)
function transpose(a) {
    return a[0].map((_, c) => a.map(r => r[c]));
}

// Invert 3x3 matrix using adjugate matrix
function invert3x3(m) {
    const det = m[0][0] * (m[1][1] * m[2][2] - m[2][1] * m[1][2]) -
                m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
                m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    if (Math.abs(det) < 1e-12) return null; // Singular

    const inv = [
        [
             (m[1][1] * m[2][2] - m[2][1] * m[1][2]) / det,
            -(m[0][1] * m[2][2] - m[0][2] * m[2][1]) / det,
             (m[0][1] * m[1][2] - m[0][2] * m[1][1]) / det
        ],
        [
            -(m[1][0] * m[2][2] - m[1][2] * m[2][0]) / det,
             (m[0][0] * m[2][2] - m[0][2] * m[2][0]) / det,
            -(m[0][0] * m[1][2] - m[1][0] * m[0][2]) / det
        ],
        [
             (m[1][0] * m[2][1] - m[2][0] * m[1][1]) / det,
            -(m[0][0] * m[2][1] - m[2][0] * m[0][1]) / det,
             (m[0][0] * m[1][1] - m[1][0] * m[0][1]) / det
        ]
    ];
    return inv;
}

// Simple Linear Regression y = m*x + b
function linearRegression(x, y) {
    const n = x.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let i = 0; i < n; i++) {
        sumX += x[i];
        sumY += y[i];
        sumXY += x[i] * y[i];
        sumXX += x[i] * x[i];
    }
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    // Calculate R2
    const meanY = sumY / n;
    let ssTot = 0, ssRes = 0;
    for(let i = 0; i < n; i++){
        ssTot += Math.pow(y[i] - meanY, 2);
        ssRes += Math.pow(y[i] - (slope * x[i] + intercept), 2);
    }
    const r2 = ssTot === 0 ? 1 : 1 - (ssRes / ssTot);
    return { slope, intercept, r2 };
}

// ----- HPLC PHYSICS FITS -----

window.HPLCPhysics = {
    // 1. Linear Solvent Strength (LSS)
    // Runs should be array of { phi, k }
    fitLSS: function(runs) {
        if(runs.length < 2) return null;
        const x = runs.map(r => r.phi); // phi in 0-1 or 0-100? Assuming 0-100 for user input, let's keep it as is
        const y = runs.map(r => Math.log10(r.k));
        const fit = linearRegression(x, y);
        return {
            S: -fit.slope,
            logkw: fit.intercept,
            kw: Math.pow(10, fit.intercept),
            r2: fit.r2
        };
    },

    // 2. Van Deemter Fit (Global)
    // Runs should be array of { u, H }
    fitVanDeemter: function(runs) {
        if(runs.length < 3) return null;
        const X = runs.map(r => [1, 1 / r.u, r.u]);
        const Y = runs.map(r => [r.H]);
        
        const XT = transpose(X);
        const XTX = multiplyMatrices(XT, X);
        const XTX_inv = invert3x3(XTX);
        if(!XTX_inv) return null; // Collinear data
        
        const XTY = multiplyMatrices(XT, Y);
        const B = multiplyMatrices(XTX_inv, XTY); // [A, B, C]^T
        
        const A = B[0][0];
        const B_coef = B[1][0];
        const C = B[2][0];
        
        // Calculate R2
        const meanH = Y.reduce((a, b) => a + b[0], 0) / Y.length;
        let ssTot = 0, ssRes = 0;
        for(let i=0; i<runs.length; i++){
            const predH = A + B_coef/runs[i].u + C*runs[i].u;
            ssTot += Math.pow(runs[i].H - meanH, 2);
            ssRes += Math.pow(runs[i].H - predH, 2);
        }
        const r2 = ssTot === 0 ? 1 : 1 - (ssRes/ssTot);
        
        const u_opt = Math.sqrt(B_coef / C);
        const H_min = A + 2 * Math.sqrt(B_coef * C);
        
        return { A, B: B_coef, C, r2, u_opt, H_min };
    },

    // 3. Van't Hoff Fit
    // Runs should be array of { T_K, k } (T_K in Kelvin)
    fitVantHoff: function(runs) {
        if(runs.length < 2) return null;
        const R = 8.314; // J/(mol K)
        const x = runs.map(r => 1 / r.T_K);
        const y = runs.map(r => Math.log(r.k));
        const fit = linearRegression(x, y);
        const deltaH = -fit.slope * R; // J/mol
        return {
            deltaH: deltaH / 1000, // convert to kJ/mol for display
            deltaH_J: deltaH,
            r2: fit.r2
        };
    },

    // Reference table for approximate viscosity (mPa.s)
    viscosityTable: [
        { T: 20, v0: 1.002, v20: 0.83, v50: 0.63, v80: 0.43 },
        { T: 25, v0: 0.890, v20: 0.74, v50: 0.56, v80: 0.40 },
        { T: 30, v0: 0.798, v20: 0.67, v50: 0.50, v80: 0.37 },
        { T: 35, v0: 0.719, v20: 0.60, v50: 0.46, v80: 0.34 },
        { T: 40, v0: 0.653, v20: 0.55, v50: 0.42, v80: 0.31 },
        { T: 45, v0: 0.596, v20: 0.50, v50: 0.38, v80: 0.29 },
        { T: 50, v0: 0.547, v20: 0.46, v50: 0.35, v80: 0.27 },
        { T: 55, v0: 0.504, v20: 0.43, v50: 0.33, v80: 0.25 },
        { T: 60, v0: 0.467, v20: 0.40, v50: 0.31, v80: 0.24 }
    ],

    // Interpolate viscosity given T (Celsius) and phi (0-100)
    // We do simple bilinear interpolation from the table
    estimateViscosity: function(T, phi) {
        const table = this.viscosityTable;
        let t1 = table[0], t2 = table[table.length - 1];
        for(let i=0; i<table.length-1; i++){
            if(T >= table[i].T && T <= table[i+1].T) {
                t1 = table[i]; t2 = table[i+1]; break;
            }
        }
        // interpolate along T for each phi anchor
        const getV = (phi_anchor) => {
            if(t1.T === t2.T) return t1[phi_anchor];
            const frac = (T - t1.T) / (t2.T - t1.T);
            return t1[phi_anchor] + frac * (t2[phi_anchor] - t1[phi_anchor]);
        };
        const v0 = getV('v0'), v20 = getV('v20'), v50 = getV('v50'), v80 = getV('v80');
        
        // interpolate along phi
        if(phi <= 20) return v0 + (phi - 0)/20 * (v20 - v0);
        if(phi <= 50) return v20 + (phi - 20)/30 * (v50 - v20);
        if(phi <= 80) return v50 + (phi - 50)/30 * (v80 - v50);
        return v80 + (phi - 80)/20 * (v80 * 0.8 - v80); // rough extrap beyond 80%
    }
};
