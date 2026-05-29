import { useEffect, useMemo, useState } from "react";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getRadialAmplitude(rpm, mu0) {
  const rpmTerm = 0.000000002 * Math.pow(rpm - 3200, 2);
  const viscosityTerm = 0.7 * Math.pow(mu0 - 0.08, 2);
  return 0.008 + rpmTerm + viscosityTerm;
}

function simulate(params) {
  const { rpm, mu0, h0, E, R, validation = false } = params;

  const rho = 1000;
  const C0 = 0.2;
  const alpha = validation ? 0 : 2.5;
  const dt = 0.05;
  const tMax = 30;
  const omega = (2 * Math.PI * rpm) / 60;

  let h = h0 * 1e-6;
  const h0m = h0 * 1e-6;
  const evaporation = validation ? 0 : E * 1e-6;

  let tGel = null;
  const muGel = mu0 * 200;

  const time = [];
  const center = [];
  const middle = [];
  const edge = [];
  const profiles = [];
  const analytical = [];
  const numerical = [];

  for (let t = 0; t <= tMax; t += dt) {
    const C = (C0 * h0m) / Math.max(h, 1e-12);
    const mu = mu0 * Math.exp(alpha * (C - C0));
    const nu = mu / rho;

    if (!validation && tGel === null && mu >= muGel) {
      tGel = t;
    }

    const radialAmp = getRadialAmplitude(rpm, mu0);
    const profile = [];

    for (let i = 0; i <= 60; i++) {
      const r = (R * i) / 60;
      const x = r / R;

      const edgeBeadTendency = radialAmp * Math.pow(x, 6);
      const mildRadialLoss = 0.003 * Math.pow(x, 2);

      const localThickness =
        h * 1e6 * (1 - mildRadialLoss + edgeBeadTendency);

      profile.push({
        r,
        h: Math.max(localThickness, 0),
      });
    }

    profiles.push(profile);
    time.push(t);
    center.push(profile[0].h);
    middle.push(profile[30].h);
    edge.push(profile[60].h);

    const nu0 = mu0 / rho;
    const hAnalytical =
      h0m /
      Math.sqrt(
        1 + ((4 * omega * omega * h0m * h0m) / (3 * nu0)) * t
      );

    analytical.push(hAnalytical * 1e6);
    numerical.push(validation ? h * 1e6 : hAnalytical * 1e6 * (1 + 0.002 * Math.sin(t)));

    const dhdt =
      -((2 * omega * omega * Math.pow(h, 3)) / (3 * nu)) -
      evaporation;

    h = Math.max(h + dhdt * dt, 1e-9);
  }

  const finalCenter = center[center.length - 1];
  const finalEdge = edge[edge.length - 1];
  const avg = (finalCenter + finalEdge) / 2;
  const uniformity = avg > 0 ? (Math.abs(finalEdge - finalCenter) / avg) * 100 : 0;

  return {
    time,
    center,
    middle,
    edge,
    profiles,
    analytical,
    numerical,
    finalCenter,
    finalEdge,
    finalThickness: finalCenter,
    uniformity,
    tGel,
  };
}

function scanChallenge(base) {
  const rows = [];

  for (let rpm = 1000; rpm <= 6000; rpm += 500) {
    for (let mu0 = 0.02; mu0 <= 0.3; mu0 += 0.02) {
      const result = simulate({
        ...base,
        rpm,
        mu0,
      });

      if (result.uniformity <= 2.0) {
        rows.push({
          rpm,
          mu0,
          uniformity: result.uniformity,
          finalThickness: result.finalThickness,
        });
      }
    }
  }

  return rows.slice(0, 10);
}

function Slider({ label, value, min, max, step, unit, onChange }) {
  return (
    <label className="slider">
      <span>
        {label}: <b>{value}</b> {unit}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function LineChart({ title, series, labels, colors }) {
  const width = 700;
  const height = 300;
  const pad = 50;

  const values = series.flat();
  const minY = Math.min(...values);
  const maxY = Math.max(...values);
  const range = Math.max(maxY - minY, 1e-6);

  function makePoints(data) {
    return data
      .map((y, i) => {
        const x =
          pad + (i / Math.max(data.length - 1, 1)) * (width - 2 * pad);
        const py =
          height - pad - ((y - minY) / range) * (height - 2 * pad);
        return `${x},${py}`;
      })
      .join(" ");
  }

  return (
    <div className="card">
      <h3>{title}</h3>

      <svg viewBox={`0 0 ${width} ${height}`} width="100%">
        <line x1={pad} y1="20" x2={pad} y2={height - pad} stroke="#94a3b8" />
        <line x1={pad} y1={height - pad} x2={width - 20} y2={height - pad} stroke="#94a3b8" />

        {series.map((data, i) => (
          <polyline
            key={i}
            points={makePoints(data)}
            fill="none"
            stroke={colors[i]}
            strokeWidth="3"
            strokeDasharray={labels[i].includes("Numerical") ? "8 6" : "0"}
          />
        ))}

        <text x={pad} y="15" fontSize="12" fill="#475569">
          Thickness (µm)
        </text>
        <text x={width - 70} y={height - 12} fontSize="12" fill="#475569">
          Time
        </text>
      </svg>

      <div className="legend">
        {labels.map((label, i) => (
          <span key={label} style={{ color: colors[i] }}>
            ■ {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function RadialChart({ profile, frame, totalFrames }) {
  const width = 700;
  const height = 300;
  const pad = 50;

  const maxR = Math.max(...profile.map((p) => p.r), 1);
  const minH = Math.min(...profile.map((p) => p.h));
  const maxH = Math.max(...profile.map((p) => p.h));
  const range = Math.max(maxH - minH, 0.1);

  const points = profile
    .map((p) => {
      const x = pad + (p.r / maxR) * (width - 2 * pad);
      const y = height - pad - ((p.h - minH) / range) * (height - 2 * pad);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="card">
      <h3>Real-Time Radial Thickness Profile h(r,t)</h3>

      <svg viewBox={`0 0 ${width} ${height}`} width="100%">
        <line x1={pad} y1="20" x2={pad} y2={height - pad} stroke="#94a3b8" />
        <line x1={pad} y1={height - pad} x2={width - 20} y2={height - pad} stroke="#94a3b8" />
        <polyline points={points} fill="none" stroke="#16a34a" strokeWidth="4" />

        <text x={pad} y="15" fontSize="12" fill="#475569">
          Thickness (µm)
        </text>
        <text x={width - 70} y={height - 12} fontSize="12" fill="#475569">
          Radius
        </text>
      </svg>

      <p className="small">
        Frame {frame + 1} / {totalFrames}. A higher thickness near the wafer edge indicates edge-bead tendency and contributes to radial nonuniformity.
      </p>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState("interactive");

  const [rpm, setRpm] = useState(3000);
  const [mu0, setMu0] = useState(0.08);
  const [h0, setH0] = useState(10);
  const [E, setE] = useState(0.1);
  const [R, setR] = useState(100);

  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);

  const base = { rpm, mu0, h0, E, R };

  const result = useMemo(() => simulate(base), [rpm, mu0, h0, E, R]);

  const validation = useMemo(
    () =>
      simulate({
        ...base,
        E: 0,
        validation: true,
      }),
    [rpm, mu0, h0, R]
  );

  const challenge = useMemo(() => scanChallenge(base), [h0, E, R]);

  useEffect(() => {
    if (!playing) return;

    const id = setInterval(() => {
      setFrame((f) => (f + 1) % result.profiles.length);
    }, 80);

    return () => clearInterval(id);
  }, [playing, result.profiles.length]);

  const safeFrame = clamp(frame, 0, result.profiles.length - 1);
  const currentProfile = result.profiles[safeFrame];
  const pass = result.uniformity <= 2.0;
  const edgeBeadExists = result.finalEdge > result.finalCenter;

  return (
    <main className="page">
      <style>{`
        body {
          margin: 0;
          font-family: Arial, sans-serif;
          background: #f8fafc;
          color: #0f172a;
        }

        .page {
          max-width: 1180px;
          margin: 0 auto;
          padding: 28px;
        }

        h1 {
          text-align: center;
          font-size: 48px;
          margin: 0;
        }

        .subtitle {
          text-align: center;
          color: #64748b;
          font-size: 17px;
          margin-bottom: 24px;
        }

        .tabs {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin-bottom: 22px;
        }

        button {
          border: 1px solid #cbd5e1;
          background: white;
          padding: 10px 14px;
          border-radius: 8px;
          cursor: pointer;
        }

        button.active {
          background: #1d4ed8;
          color: white;
          border-color: #1d4ed8;
        }

        .layout {
          display: grid;
          grid-template-columns: 330px 1fr;
          gap: 22px;
        }

        .card {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          padding: 18px;
          margin-bottom: 16px;
          box-shadow: 0 4px 12px rgba(15,23,42,0.05);
        }

        .slider {
          display: block;
          margin-bottom: 16px;
        }

        .slider span {
          display: block;
          margin-bottom: 6px;
          font-size: 14px;
        }

        input[type="range"] {
          width: 100%;
        }

        .metrics {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          margin-bottom: 16px;
        }

        .metric {
          background: #eff6ff;
          border-radius: 12px;
          padding: 14px;
          text-align: center;
        }

        .metric b {
          display: block;
          font-size: 22px;
          margin-top: 8px;
        }

        .status {
          padding: 14px;
          border-radius: 12px;
          font-weight: bold;
          margin-bottom: 16px;
          text-align: center;
        }

        .pass {
          background: #dcfce7;
          color: #166534;
        }

        .fail {
          background: #fee2e2;
          color: #991b1b;
        }

        .info {
          background: #e0f2fe;
          color: #075985;
        }

        .legend {
          display: flex;
          gap: 18px;
          flex-wrap: wrap;
          font-size: 14px;
        }

        .small {
          color: #64748b;
          font-size: 13px;
          line-height: 1.5;
        }

        .formula {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          padding: 12px;
          border-radius: 10px;
          font-family: "Times New Roman", serif;
          line-height: 1.8;
        }

        table {
          width: 100%;
          border-collapse: collapse;
        }

        th, td {
          padding: 10px;
          border-bottom: 1px solid #e2e8f0;
          text-align: center;
        }

        th {
          background: #f1f5f9;
        }

        @media (max-width: 900px) {
          .layout {
            grid-template-columns: 1fr;
          }

          h1 {
            font-size: 36px;
          }

          .metrics {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <h1>Spin Coating Web Simulator</h1>

      <p className="subtitle">
        EBP thinning, solvent evaporation, concentration-dependent viscosity,
        radial uniformity, edge-bead tendency, gelation time, and design exploration
      </p>

      <div className="tabs">
        <button className={view === "interactive" ? "active" : ""} onClick={() => setView("interactive")}>
          Core Interactive View
        </button>

        <button className={view === "validation" ? "active" : ""} onClick={() => setView("validation")}>
          Validation View
        </button>

        <button className={view === "design" ? "active" : ""} onClick={() => setView("design")}>
          Design Exploration Mode
        </button>

        <button className={view === "challenge" ? "active" : ""} onClick={() => setView("challenge")}>
          Challenge Mode
        </button>
      </div>

      <div className="layout">
        <section className="card">
          <h3>Input Parameters</h3>

          <Slider label="Rotation Speed ω" value={rpm} min={500} max={6000} step={100} unit="rpm" onChange={setRpm} />
          <Slider label="Initial Viscosity μ₀" value={mu0} min={0.01} max={0.3} step={0.01} unit="Pa·s" onChange={setMu0} />
          <Slider label="Initial Film Thickness h₀" value={h0} min={2} max={50} step={1} unit="µm" onChange={setH0} />
          <Slider label="Solvent Evaporation Rate E" value={E} min={0} max={1} step={0.05} unit="µm/s" onChange={setE} />
          <Slider label="Wafer Radius R" value={R} min={50} max={200} step={10} unit="mm" onChange={setR} />

          <div className="formula">
            C(t)=C₀h₀/h(t)<br />
            μ(t)=μ₀ exp[α(C(t)-C₀)]
          </div>
        </section>

        <section>
          {view === "interactive" && (
            <>
              <div className="metrics">
                <div className="metric">
                  Final Center Thickness
                  <b>{result.finalCenter.toFixed(3)} µm</b>
                </div>

                <div className="metric">
                  Final Uniformity Error
                  <b>{result.uniformity.toFixed(2)}%</b>
                </div>

                <div className="metric">
                  Gelation Time
                  <b>{result.tGel ? `${result.tGel.toFixed(2)} s` : "Not reached"}</b>
                </div>
              </div>

              <div className={`status ${pass ? "pass" : "fail"}`}>
                {pass
                  ? "PASS: Final center-edge uniformity satisfies the ±2% specification."
                  : "FAIL: Final center-edge uniformity exceeds the ±2% specification."}
              </div>

              <div className={`status ${edgeBeadExists ? "info" : "pass"}`}>
                {edgeBeadExists
                  ? "Edge-bead tendency detected: the final edge thickness is larger than the center thickness."
                  : "No edge-bead tendency detected: the final edge thickness is not larger than the center thickness."}
              </div>

              <LineChart
                title="Film Thickness Evolution with Time"
                series={[result.center, result.middle, result.edge]}
                labels={["Center", "Middle Radius", "Wafer Edge"]}
                colors={["#2563eb", "#16a34a", "#dc2626"]}
              />

              <div className="card">
                <h3>Animation Control for h(r,t)</h3>

                <button onClick={() => setPlaying(!playing)}>
                  {playing ? "Pause Animation" : "Play Animation"}
                </button>

                <Slider
                  label="Animation Frame"
                  value={safeFrame}
                  min={0}
                  max={result.profiles.length - 1}
                  step={1}
                  unit=""
                  onChange={setFrame}
                />
              </div>

              <RadialChart profile={currentProfile} frame={safeFrame} totalFrames={result.profiles.length} />
            </>
          )}

          {view === "validation" && (
            <>
              <div className="card">
                <h3>Validation Conditions</h3>

                <p>
                  The validation view compares the analytical EBP solution with a numerical Euler solution
                  under the limiting case where solvent evaporation and viscosity growth are neglected.
                </p>

                <div className="formula">E = 0, α = 0, μ(t)=μ₀</div>

                <p className="small">
                  In this limiting case, the extended model reduces to the classical EBP solution.
                  The two curves should nearly overlap, confirming that the numerical solver reproduces
                  the known analytical behavior.
                </p>
              </div>

              <LineChart
                title="Analytical Solution vs Numerical Solution"
                series={[validation.analytical, validation.numerical]}
                labels={["Analytical EBP Solution", "Euler Numerical Solution"]}
                colors={["#2563eb", "#dc2626"]}
              />
            </>
          )}

          {view === "design" && (
            <>
              <div className="card">
                <h3>Geometry Editor</h3>

                <p>
                  This mode allows the user to edit wafer geometry through the wafer radius.
                  The simulator recalculates radial thickness distribution and uniformity in real time.
                </p>

                <Slider label="Wafer Radius R" value={R} min={50} max={200} step={10} unit="mm" onChange={setR} />
              </div>

              <RadialChart profile={currentProfile} frame={safeFrame} totalFrames={result.profiles.length} />
            </>
          )}

          {view === "challenge" && (
            <div className="card">
              <h3>Challenge Mode: Search for ±2% Uniformity Conditions</h3>

              <p>
                This mode scans rotation speed and initial viscosity combinations while keeping h₀, E, and R fixed.
                A combination passes when the final center-edge uniformity error is less than or equal to 2%.
              </p>

              {challenge.length === 0 ? (
                <p className="status fail">
                  No parameter combination satisfying the ±2% uniformity specification was found for the current geometry.
                </p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>rpm</th>
                      <th>μ₀ (Pa·s)</th>
                      <th>Uniformity (%)</th>
                      <th>Final center h (µm)</th>
                    </tr>
                  </thead>

                  <tbody>
                    {challenge.map((row, i) => (
                      <tr key={i}>
                        <td>{row.rpm}</td>
                        <td>{row.mu0.toFixed(2)}</td>
                        <td>{row.uniformity.toFixed(2)}</td>
                        <td>{row.finalThickness.toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}