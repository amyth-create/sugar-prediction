// app.js - State Management, UI Logic, and Charting

let state = {
    stage: 1,
    column: { L: 25, dc: 4.6, dp: 5.0, Dm: 3e-6 },
    runs: [
        { id: 1, type: 'Baseline', phi: 85, F: 0.5, T: 25 },
        { id: 2, type: 'Composition', phi: 70, F: 0.5, T: 25 },
        { id: 3, type: 'Flow', phi: 85, F: 1.0, T: 25 },
        { id: 4, type: 'Flow', phi: 85, F: 0.2, T: 25 },
        { id: 5, type: 'Temperature', phi: 85, F: 0.5, T: 40 }
    ],
    compounds: ["Xylose", "Mannose", "Fructose"],
    data: {}, // { runId: { tM, compounds: [{tR, wHalf}] } }
    params: null, // extracted parameters
    sim: { phi: 72.5, F: 0.35, T: 35 }
};

// Colors for compounds
const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

function init() {
    setupStage2Sync();
    generateDataGrid();
    setupCanvas();
    loadState(); // load from localStorage if exists
}

function saveState() {
    localStorage.setItem('hplc_state', JSON.stringify(state));
}

function loadState() {
    const saved = localStorage.getItem('hplc_state');
    if(saved) {
        state = JSON.parse(saved);
        goToStage(state.stage);
    } else {
        goToStage(1);
    }
}

// Stage Navigation
function goToStage(stageNum) {
    // Hide all
    for(let i=1; i<=4; i++) {
        document.getElementById(`stage${i}`).classList.add('hidden');
        const stepBtn = document.getElementById(`step${i}`);
        stepBtn.classList.remove('active');
        if(i < stageNum) stepBtn.classList.add('completed');
        else stepBtn.classList.remove('completed');
    }
    
    // Show target
    document.getElementById(`stage${stageNum}`).classList.remove('hidden');
    document.getElementById(`step${stageNum}`).classList.add('active');
    
    // Save data before transition if moving forward
    if(state.stage === 1 && stageNum > 1) {
        state.column.L = parseFloat(document.getElementById('colLength').value);
        state.column.dc = parseFloat(document.getElementById('colId').value);
        state.column.dp = parseFloat(document.getElementById('colDp').value);
        state.column.Dm = parseFloat(document.getElementById('diffDm').value);
    }
    if(state.stage === 2 && stageNum > 2) {
        // Collect run configs
        state.runs[0] = { id:1, type:'Baseline', phi: parseFloat(document.getElementById('run1_phi').value), F: parseFloat(document.getElementById('run1_F').value), T: parseFloat(document.getElementById('run1_T').value) };
        state.runs[1] = { id:2, type:'Composition', phi: parseFloat(document.getElementById('run2_phi').value), F: state.runs[0].F, T: state.runs[0].T };
        state.runs[2] = { id:3, type:'Flow', phi: state.runs[0].phi, F: parseFloat(document.getElementById('run3_F').value), T: state.runs[0].T };
        state.runs[3] = { id:4, type:'Flow', phi: state.runs[0].phi, F: parseFloat(document.getElementById('run4_F').value), T: state.runs[0].T };
        state.runs[4] = { id:5, type:'Temperature', phi: state.runs[0].phi, F: state.runs[0].F, T: parseFloat(document.getElementById('run5_T').value) };
        generateDataGrid();
    }
    
    state.stage = stageNum;
    saveState();
    
    if(stageNum === 4) {
        updateSimulation(); // initial render
    }
}

// Stage 2: Sync locked fields to Run 1
function setupStage2Sync() {
    const r1F = document.getElementById('run1_F');
    const r1T = document.getElementById('run1_T');
    const r1P = document.getElementById('run1_phi');
    
    const updateLocks = () => {
        document.getElementById('run2_F_locked').innerText = r1F.value;
        document.getElementById('run2_T_locked').innerText = r1T.value;
        
        document.getElementById('run3_phi_locked').innerText = r1P.value;
        document.getElementById('run3_T_locked').innerText = r1T.value;
        
        document.getElementById('run4_phi_locked').innerText = r1P.value;
        document.getElementById('run4_T_locked').innerText = r1T.value;
        
        document.getElementById('run5_phi_locked').innerText = r1P.value;
        document.getElementById('run5_F_locked').innerText = r1F.value;
    };
    
    r1F.addEventListener('input', updateLocks);
    r1T.addEventListener('input', updateLocks);
    r1P.addEventListener('input', updateLocks);
}

// Stage 3: Data Grid Generation
function generateDataGrid() {
    const num = parseInt(document.getElementById('numCompounds').value);
    state.compounds = [];
    for(let i=1; i<=num; i++) state.compounds.push(`Compound ${i}`);
    
    const container = document.getElementById('dataGridContainer');
    container.innerHTML = '';
    
    state.runs.forEach(run => {
        const div = document.createElement('div');
        div.className = 'glass-panel';
        div.style.padding = '1rem';
        
        const mockTm = 1.0 / run.F;
        let html = `<h3 style="margin-top:0">Run ${run.id}: ${run.phi}%B, ${run.F} mL/min, ${run.T}°C</h3>
                    <div class="form-group" style="max-width: 200px">
                        <label>Dead Time tM (min)</label>
                        <input type="number" step="0.01" id="tM_${run.id}" value="${mockTm.toFixed(2)}" />
                    </div>
                    <table>
                        <thead><tr><th>Compound</th><th>tR (min)</th><th>w½ (min)</th></tr></thead>
                        <tbody>`;
        
        state.compounds.forEach((c, idx) => {
            // Realistic mock values to avoid collinearity/singular matrices
            let k = 1.0 + idx * 1.5;
            if (run.phi === 70) k *= 2.0; 
            if (run.T === 40) k *= 0.7;
            const mockTR = mockTm * (1 + k);
            const mockW = 2.355 * mockTR / Math.sqrt(5000); // assume N~5000

            html += `<tr>
                        <td>${c}</td>
                        <td><input type="number" step="0.01" id="tR_${run.id}_${idx}" value="${mockTR.toFixed(2)}" /></td>
                        <td><input type="number" step="0.01" id="w_${run.id}_${idx}" value="${mockW.toFixed(2)}" /></td>
                     </tr>`;
        });
        html += `</tbody></table>`;
        div.innerHTML = html;
        container.appendChild(div);
    });
}

// Process data to parameters
function processData() {
    // 1. Gather all inputs into state.data
    state.runs.forEach(run => {
        state.data[run.id] = {
            tM: parseFloat(document.getElementById(`tM_${run.id}`).value),
            compounds: []
        };
        state.compounds.forEach((c, idx) => {
            state.data[run.id].compounds.push({
                name: c,
                tR: parseFloat(document.getElementById(`tR_${run.id}_${idx}`).value),
                wHalf: parseFloat(document.getElementById(`w_${run.id}_${idx}`).value)
            });
        });
    });

    state.params = { lss: [], vanDeemter: null, vantHoff: [] };

    // Global Van Deemter Fit (Runs 1, 3, 4)
    const vdRuns = [state.runs[0], state.runs[2], state.runs[3]];
    let vdFitData = [];
    vdRuns.forEach(run => {
        const d = state.data[run.id];
        const u = state.column.L / (d.tM * 60); // cm/s
        let sumH = 0;
        d.compounds.forEach(c => {
            const N = 5.545 * Math.pow(c.tR / c.wHalf, 2);
            const H = state.column.L / N;
            sumH += H;
        });
        vdFitData.push({ u: u, H: sumH / state.compounds.length });
    });
    state.params.vanDeemter = window.HPLCPhysics.fitVanDeemter(vdFitData);
    if (!state.params.vanDeemter) {
        alert("Van Deemter fit failed. Please ensure flow rates are different and data is not perfectly collinear.");
    }

    // Per compound fits
    state.compounds.forEach((c, idx) => {
        // LSS (Runs 1, 2)
        const lssRuns = [state.runs[0], state.runs[1]];
        const lssFitData = lssRuns.map(run => {
            const d = state.data[run.id];
            const tR = d.compounds[idx].tR;
            return { phi: run.phi, k: (tR - d.tM) / d.tM };
        });
        state.params.lss.push(window.HPLCPhysics.fitLSS(lssFitData));

        // Van't Hoff (Runs 1, 5)
        const vhRuns = [state.runs[0], state.runs[4]];
        const vhFitData = vhRuns.map(run => {
            const d = state.data[run.id];
            const tR = d.compounds[idx].tR;
            return { T_K: run.T + 273.15, k: (tR - d.tM) / d.tM };
        });
        state.params.vantHoff.push(window.HPLCPhysics.fitVantHoff(vhFitData));
    });

    // Setup initial sliders for Stage 4 based on Run 1
    const s_phi = document.getElementById('sim_phi');
    const s_F = document.getElementById('sim_F');
    const s_T = document.getElementById('sim_T');
    
    s_phi.value = state.runs[0].phi;
    s_F.value = state.runs[0].F;
    s_T.value = state.runs[0].T;
    
    goToStage(4);
}

// Stage 4 Simulation Engine
function setupCanvas() {
    const s_phi = document.getElementById('sim_phi');
    const s_F = document.getElementById('sim_F');
    const s_T = document.getElementById('sim_T');
    const mode = document.getElementById('sim_mode');
    
    const update = () => {
        state.sim.phi = parseFloat(s_phi.value);
        state.sim.F = parseFloat(s_F.value);
        state.sim.T = parseFloat(s_T.value);
        
        document.getElementById('lbl_phi').innerText = `[${state.sim.phi.toFixed(1)}%]`;
        document.getElementById('lbl_F').innerText = `[${state.sim.F.toFixed(2)}]`;
        document.getElementById('lbl_T').innerText = `[${state.sim.T.toFixed(0)}]`;
        
        updateSimulation();
    };
    
    s_phi.addEventListener('input', update);
    s_F.addEventListener('input', update);
    s_T.addEventListener('input', update);
    mode.addEventListener('change', updateSimulation);
}

function updateSimulation() {
    if(!state.params || !state.params.vanDeemter) return;

    const { phi, F, T } = state.sim;
    const refRun = state.runs[0]; // Baseline
    const refData = state.data[refRun.id];
    
    // 1. New Dead Time
    const tM_new = refData.tM * (refRun.F / F);
    const u_new = state.column.L / (tM_new * 60);

    // 2. Adjust Van Deemter for T
    const v_ref = window.HPLCPhysics.estimateViscosity(refRun.T, refRun.phi);
    const v_new = window.HPLCPhysics.estimateViscosity(T, phi);
    const T_ref_K = refRun.T + 273.15;
    const T_new_K = T + 273.15;
    
    const Dm_new = state.column.Dm * (T_new_K / T_ref_K) * (v_ref / v_new);
    const vd = state.params.vanDeemter;
    
    const B_new = vd.B * (Dm_new / state.column.Dm);
    const C_new = vd.C * (state.column.Dm / Dm_new);
    const H_new = vd.A + B_new / u_new + C_new * u_new;
    const N_new = state.column.L / H_new;

    let peaks = [];
    let maxTR = 0;

    // 3. Predict k, tR, sigma for each compound
    state.compounds.forEach((c, i) => {
        const lss = state.params.lss[i];
        const vh = state.params.vantHoff[i];
        
        if(!lss || !vh) return; // Guard against singular fits

        // k at new phi (at T_ref)
        const k_phi = Math.pow(10, lss.logkw - lss.S * phi);
        
        // Adjust for T
        const k_final = k_phi * Math.exp(-(vh.deltaH_J / 8.314) * (1/T_new_K - 1/T_ref_K));
        
        const tR = tM_new * (1 + k_final);
        const sigma = tR / Math.sqrt(N_new);
        const wHalf = 2.355 * sigma;
        
        // height normalized to area = 1
        const height = 1.0 / (sigma * Math.sqrt(2 * Math.PI));

        if(tR > maxTR) maxTR = tR;

        peaks.push({ name: c, k: k_final, tR, sigma, wHalf, height });
    });

    // Calculate Resolution
    peaks.sort((a,b) => a.tR - b.tR);
    for(let i=0; i<peaks.length-1; i++){
        const p1 = peaks[i], p2 = peaks[i+1];
        peaks[i].Rs = (p2.tR - p1.tR) / (2 * (p1.sigma + p2.sigma));
    }
    peaks[peaks.length-1].Rs = Infinity; // last one has no next peak

    updateTables(peaks, vd);
    drawChromatogram(peaks, tM_new, maxTR + 5 * peaks[peaks.length-1].sigma);
}

function updateTables(peaks, vd) {
    const tbody = document.querySelector('#peaksTable tbody');
    tbody.innerHTML = '';
    
    peaks.forEach((p, i) => {
        let rsBadge = '-';
        if(p.Rs !== Infinity) {
            if(p.Rs < 0.8) rsBadge = `<span class="badge danger">🔴 ${p.Rs.toFixed(2)}</span>`;
            else if(p.Rs < 1.5) rsBadge = `<span class="badge warning">🟡 ${p.Rs.toFixed(2)}</span>`;
            else rsBadge = `<span class="badge success">🟢 ${p.Rs.toFixed(2)}</span>`;
        }
        
        tbody.innerHTML += `<tr>
            <td>${i+1}</td>
            <td><strong style="color:${colors[i%colors.length]}">${p.name}</strong></td>
            <td>${p.k.toFixed(2)}</td>
            <td>${p.tR.toFixed(2)}</td>
            <td>${p.wHalf.toFixed(2)}</td>
            <td>${Math.round(state.column.L / (vd.A + vd.B/ (state.column.L / (state.data[1].tM * 60)) + vd.C * (state.column.L / (state.data[1].tM * 60)))) }</td>
            <td>${rsBadge}</td>
        </tr>`;
    });

    const ptbody = document.querySelector('#paramsTable tbody');
    ptbody.innerHTML = '';
    state.compounds.forEach((c, i) => {
        ptbody.innerHTML += `<tr>
            <td>${c}</td>
            <td>${state.params.lss[i].S.toFixed(2)}</td>
            <td>${state.params.lss[i].kw.toFixed(1)}</td>
            <td>${state.params.vantHoff[i].deltaH.toFixed(2)}</td>
        </tr>`;
    });
    
    document.getElementById('globalParams').innerHTML = `
        Van Deemter (global): A=${vd.A.toFixed(4)}, B=${vd.B.toExponential(2)}, C=${vd.C.toFixed(4)} <br/>
        Optimal Velocity (u_opt): ${vd.u_opt.toFixed(3)} cm/s
    `;
}

function drawChromatogram(peaks, tM, tMax) {
    const canvas = document.getElementById('chromatogramCanvas');
    const ctx = canvas.getContext('2d');
    
    // handle resize
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width || 800;
    canvas.height = rect.height || 400;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const mode = document.getElementById('sim_mode').value; // both, sum, individual
    
    const margin = { left: 50, right: 20, top: 20, bottom: 40 };
    const w = canvas.width - margin.left - margin.right;
    const h = canvas.height - margin.top - margin.bottom;
    
    // Axes
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.beginPath();
    ctx.moveTo(margin.left, margin.top);
    ctx.lineTo(margin.left, margin.top + h);
    ctx.lineTo(margin.left + w, margin.top + h);
    ctx.stroke();

    // Time max + 10% buffer
    const domainMax = Math.max(tMax, tM * 1.5) * 1.1;
    
    // Find max signal for Y scaling
    let maxSignal = 0;
    const points = 1000;
    let traceSum = new Float32Array(points);
    let tracesInd = peaks.map(() => new Float32Array(points));
    
    for(let i=0; i<points; i++) {
        const t = (i / points) * domainMax;
        let sum = 0;
        peaks.forEach((p, idx) => {
            const val = p.height * Math.exp(-Math.pow(t - p.tR, 2) / (2 * p.sigma * p.sigma));
            tracesInd[idx][i] = val;
            sum += val;
        });
        traceSum[i] = sum;
        if(sum > maxSignal) maxSignal = sum;
    }
    
    // Adjust y scaling
    const yMax = maxSignal * 1.2;
    
    const xToPx = t => margin.left + (t / domainMax) * w;
    const yToPx = y => margin.top + h - (y / yMax) * h;

    // Draw tM marker
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(xToPx(tM), margin.top);
    ctx.lineTo(xToPx(tM), margin.top + h);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '12px sans-serif';
    ctx.fillText('tM', xToPx(tM) - 10, margin.top - 5);

    // Draw individual peaks
    if(mode === 'both' || mode === 'individual') {
        peaks.forEach((p, idx) => {
            ctx.fillStyle = colors[idx % colors.length] + '40'; // 25% opacity
            ctx.strokeStyle = colors[idx % colors.length];
            ctx.lineWidth = 2;
            
            ctx.beginPath();
            ctx.moveTo(xToPx(0), yToPx(0));
            for(let i=0; i<points; i++) {
                const t = (i / points) * domainMax;
                ctx.lineTo(xToPx(t), yToPx(tracesInd[idx][i]));
            }
            ctx.lineTo(xToPx(domainMax), yToPx(0));
            ctx.fill();
            ctx.stroke();
        });
    }

    // Draw Sum trace
    if(mode === 'both' || mode === 'sum') {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(xToPx(0), yToPx(traceSum[0]));
        for(let i=1; i<points; i++) {
            const t = (i / points) * domainMax;
            ctx.lineTo(xToPx(t), yToPx(traceSum[i]));
        }
        ctx.stroke();
    }
    
    // X Axis Labels
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center';
    for(let i=0; i<=domainMax; i+=Math.ceil(domainMax/10)) {
        const x = xToPx(i);
        ctx.fillText(i.toString(), x, margin.top + h + 20);
        ctx.beginPath();
        ctx.moveTo(x, margin.top + h);
        ctx.lineTo(x, margin.top + h + 5);
        ctx.stroke();
    }
    ctx.fillText('Time (min)', margin.left + w/2, margin.top + h + 35);
}

// Bootstrap
window.onload = init;
