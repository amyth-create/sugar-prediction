# HPLC Chromatogram Simulator

An interactive, browser-based isocratic HPLC simulator that predicts retention times, peak widths, and resolution from a small set of scouting runs. The user fits three independent physical models — Linear Solvent Strength (LSS), van Deemter, and van't Hoff — to five compulsory scout runs, then explores the full composition × flow × temperature space in real time.

The simulator runs entirely client-side (HTML + vanilla JS + Canvas). State is persisted to `localStorage`, so a session survives page reloads.

---

## Files

| File | Role |
| --- | --- |
| `index.html` | Stage layout, forms, stepper, controls |
| `styles.css` | Dark glassmorphism theme |
| `physics.js` | Math kernel: matrix ops, regression, LSS / van Deemter / van't Hoff fits, viscosity table |
| `app.js` | State, stage navigation, data grid, simulation loop, canvas chromatogram |
| `test_physics.js` | Node smoke test for `fitVanDeemter` (collinear vs. valid input) |

---

## How to Use the Site

The UI is organized as a 4-stage stepper. Each stage must be completed in order; data persists between stages and across reloads.

### Stage 1 — Column & System Configuration

Enter the physical column geometry and a default molecular diffusion coefficient.

- **Length** (cm), **Inner Diameter** (mm), **Particle Size** (μm)
- **Solvent A / B** labels (cosmetic)
- **Molecular Diffusion Coefficient** Dm (cm²/s) — used later to rescale the van Deemter B and C terms when the user explores new temperatures and compositions. The default 3 × 10⁻⁶ cm²/s is appropriate for small molecules in water/ACN.

### Stage 2 — Scout Run Plan

Five compulsory runs are pre-laid-out. **Run 1 is the baseline** that anchors all three models; the four others each vary exactly one parameter.

| Run | Type | Varies | Locked to Run 1 |
| --- | --- | --- | --- |
| 1 | Baseline | — (sets reference φ, F, T) | — |
| 2 | Composition | φ (% B) | F, T |
| 3 | Flow Rate | F (high) | φ, T |
| 4 | Flow Rate | F (low) | φ, T |
| 5 | Temperature | T | φ, F |

Locked cells update live as you edit Run 1 — this is the role of `setupStage2Sync()`. The design ensures each model is fit on data where only its independent variable changes:

- **LSS** ← Runs 1 & 2 (φ varied, T & F fixed)
- **van Deemter** ← Runs 1, 3, 4 (F varied → linear velocity *u* varied, φ & T fixed)
- **van't Hoff** ← Runs 1 & 5 (T varied, φ & F fixed)

### Stage 3 — Empirical Results

Choose the number of compounds (1–10) and click **Generate Grid**. For each of the 5 runs, you get a small panel with:

- **Dead time tM** (min) — the column void time in that run
- A row per compound with its measured **retention time tR** (min) and **peak width at half height w½** (min)

The grid is pre-populated with synthetic-but-physically-plausible mock values so the fits don't fail on a fresh load. Replace with your real measurements before clicking **Extract Parameters & Predict**.

### Stage 4 — Prediction

Three sliders (**% B / Flow / Temperature**) drive a live re-simulation. The page shows:

- **Simulated Chromatogram** — Gaussian peaks with three view modes: Sum + Individual, Sum Only, Individual Peaks. A dashed white line marks tM.
- **Peak Details** table — k, tR, w½, plate count N, and resolution Rs (with traffic-light badges: red < 0.8, yellow < 1.5, green ≥ 1.5).
- **Extracted Parameters** table — per-compound S, kw, ΔH°, plus the global van Deemter A/B/C and the optimal velocity u_opt.

You can return to Stage 3 to edit data without losing column setup.

---

## Theories & Formulas

The simulator combines **three independent retention/efficiency models**, each fit to a minimal number of runs, and then composes their predictions to extrapolate to arbitrary (φ, F, T).

### 1. Linear Solvent Strength (LSS) — composition dependence

Snyder's LSS model treats the log retention factor as linear in the volume fraction of organic modifier φ:

$$
\log_{10} k = \log_{10} k_w - S \cdot \varphi
$$

- **k** — retention factor of the analyte
- **kw** — extrapolated retention factor in pure aqueous mobile phase
- **S** — solvent strength parameter (slope, > 0 for reversed-phase)

This is the same linear form used in the Jeong et al. paper (Eq. 3 there, written in natural log). The implementation in `physics.js` uses base-10 log:

```js
fitLSS(runs)  // runs = [{phi, k}, ...]
  // returns { S, logkw, kw, r2 }
```

The fit is a 2-point ordinary least squares on (φ, log₁₀ k), giving an exact line — `r2` will be 1.0 with only Runs 1 & 2. If you generalize the scout plan to more compositions, the same code returns a real R².

**At prediction time** (Stage 4), the new k at a given φ is reconstructed as:

$$
k(\varphi) = 10^{\log_{10} k_w - S \cdot \varphi}
$$

> **Note on units.** The site treats φ as a percentage (0–100), not a fraction (0–1). This is consistent throughout fitting and prediction, but means the *numerical value* of S is 100× smaller than in papers that use the fractional form.

### 2. van Deemter — efficiency vs. linear velocity

The van Deemter equation describes plate height H as a function of mobile-phase linear velocity u:

$$
H(u) = A + \frac{B}{u} + C \cdot u
$$

- **A** — eddy diffusion (multipath term)
- **B** — longitudinal molecular diffusion
- **C** — mass-transfer resistance

The fit is global across compounds (the average H of all compounds is used per run), giving one (A, B, C) for the column.

The 3 unknowns require ≥ 3 distinct velocities, which is why Runs 1, 3, 4 all probe different flow rates while holding φ and T constant. `fitVanDeemter(runs)` builds the design matrix `X = [1, 1/u, u]` and solves the normal equations directly:

$$
\hat{\beta} = (X^T X)^{-1} X^T H
$$

It uses an explicit 3×3 adjugate inversion (`invert3x3`) and falls back to `null` on singular input — exercised by the `test_physics.js` smoke test.

Two derived quantities are also returned:

$$
u_{\text{opt}} = \sqrt{\frac{B}{C}} \qquad H_{\min} = A + 2\sqrt{BC}
$$

**Linear velocity** in each run is computed from column length and dead time:

$$
u = \frac{L}{t_M} \quad [\text{cm/s, with } t_M \text{ in seconds}]
$$

**Plate count per compound per run** — used to feed H values and later to compute peak widths:

$$
N = 5.545 \left( \frac{t_R}{w_{1/2}} \right)^2 \qquad H = \frac{L}{N}
$$

The 5.545 prefactor is the standard conversion from FWHM-based plates to σ-based plates (5.545 = 8 ln 2).

### 3. van't Hoff — temperature dependence

Van't Hoff relates the equilibrium constant — and so the retention factor — to inverse temperature:

$$
\ln k = -\frac{\Delta H^\circ}{R} \cdot \frac{1}{T} + \text{const}
$$

`fitVantHoff(runs)` regresses ln k against 1/T (in Kelvin) and returns ΔH° (kJ/mol):

$$
\Delta H^\circ = -\text{slope} \cdot R \quad [R = 8.314\ \text{J/(mol·K)}]
$$

**At prediction time**, the temperature correction to k uses the integrated van't Hoff form:

$$
k(T_{\text{new}}) = k(T_{\text{ref}}) \cdot \exp\!\left[ -\frac{\Delta H^\circ}{R}\left(\frac{1}{T_{\text{new}}} - \frac{1}{T_{\text{ref}}}\right) \right]
$$

This is applied multiplicatively *after* the LSS step has already produced k at the new φ.

### 4. Viscosity & diffusion-coefficient correction

Temperature and composition both change the mobile-phase viscosity, which changes Dm, which changes the B and C terms of van Deemter. The site bakes in a small lookup table of water/ACN viscosities (mPa·s) at four anchor compositions (0%, 20%, 50%, 80% organic) over T = 20–60 °C, then bilinearly interpolates:

```js
estimateViscosity(T, phi)
```

Diffusion is rescaled via the Stokes–Einstein temperature/viscosity relation:

$$
D_m^{\text{new}} = D_m^{\text{ref}} \cdot \frac{T_{\text{new}}}{T_{\text{ref}}} \cdot \frac{\eta_{\text{ref}}}{\eta_{\text{new}}}
$$

And van Deemter terms are adjusted as:

$$
B_{\text{new}} = B \cdot \frac{D_m^{\text{new}}}{D_m^{\text{ref}}} \qquad C_{\text{new}} = C \cdot \frac{D_m^{\text{ref}}}{D_m^{\text{new}}}
$$

These come from the physical interpretation of B (proportional to Dm — faster diffusion broadens longitudinally) and C (inversely proportional to Dm — faster diffusion mitigates mass-transfer resistance).

### 5. Peak width and resolution

Once k, N, and tR are known, the peak shape is reconstructed as a Gaussian:

$$
t_R = t_M (1 + k) \qquad \sigma = \frac{t_R}{\sqrt{N}} \qquad w_{1/2} = 2.355\,\sigma
$$

Resolution between adjacent peaks (after sorting by tR):

$$
R_s = \frac{t_{R,2} - t_{R,1}}{2(\sigma_1 + \sigma_2)}
$$

The chromatogram is rendered at 1000 sample points across the time domain, with each peak filled as `height · exp(-(t - tR)² / 2σ²)` and the sum trace overlaid in white. Peaks are normalized to unit area, so `height = 1 / (σ √(2π))`.

---

## Calculated Fields — Reference Table

| Symbol | Field | Formula | Where |
| --- | --- | --- | --- |
| k | Retention factor | (tR − tM) / tM | Stage 3 → fits, Stage 4 → table |
| u | Linear velocity (cm/s) | L / (tM · 60) | van Deemter fit & prediction |
| N | Plate count | 5.545 (tR / w½)² | per-compound H input, peak width output |
| H | Plate height (cm) | L / N | van Deemter input |
| u_opt | Optimal velocity | √(B / C) | global parameter readout |
| H_min | Minimum plate height | A + 2√(BC) | global parameter readout |
| tM(F) | Dead time at new flow | tM_ref · (F_ref / F) | Stage 4 simulator |
| Dm(T,φ) | Effective diffusion coeff. | Dm_ref · (T/T_ref) · (η_ref/η) | van Deemter rescaling |
| k(φ) | Retention at new φ | 10^(log kw − S·φ) | Stage 4 simulator |
| k(T) | Retention at new T | k(φ) · exp[−(ΔH/R)(1/T − 1/T_ref)] | Stage 4 simulator |
| tR | Retention time | tM (1 + k) | peak table, chromatogram |
| σ | Peak SD (min) | tR / √N | Gaussian peak rendering |
| w½ | Width at half height | 2.355 · σ | peak table |
| Rs | Resolution | (tR2 − tR1) / [2(σ1 + σ2)] | peak table, traffic-light badge |

---

## Architectural Notes

- **State shape** — `app.js` keeps a single `state` object with `column`, `runs`, `compounds`, `data`, `params`, `sim`. Saved to `localStorage` on every stage transition.
- **Scout plan rigidity** — Stage 2's locked cells are display-only spans (`run2_F_locked`, etc.) updated by `setupStage2Sync`. The actual values are pulled from Run 1 inputs at stage transition. This guarantees each fit is on a clean one-variable-only delta.
- **Mock data** — `generateDataGrid()` seeds the inputs with synthetic values designed to avoid singular fits (different effective k across composition and temperature, non-identical flow rates). A user must replace these with real lab data.
- **Failure modes** — `fitVanDeemter` returns `null` if the 3×3 normal-equations matrix is singular (collinear flows, identical H). `app.js` shows an alert and aborts the prediction. `test_physics.js` exercises both the singular and well-posed cases.
- **No browser dependencies** — no React, no Chart.js, no D3. The chromatogram is drawn directly to a 2D canvas in `drawChromatogram()`.

---

## Scope & Caveats

This simulator is **isocratic only** — it predicts steady-state retention at a fixed (φ, F, T). It does not currently implement:

- Gradient elution, gradient delay tD, or pre-elution phase
- The Craig counter-current distribution model with Fick's-law dispersion
- The Neue–Kuss nonlinear retention model
- Sample/eluent solvent-mismatch peak distortion or sample-volume-overload effects

Those are the scope of Jeong et al. (J. Chromatogr. A 1457, 2016, 41–49) and its erratum, on which a Craig-based companion simulator can be built. The present site is the closed-form, isocratic-only counterpart: faster to interact with, sufficient for rapid scouting and method-development triage, and with all extrapolations grounded in standard LSS / van Deemter / van't Hoff theory.
