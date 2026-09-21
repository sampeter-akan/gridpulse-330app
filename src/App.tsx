import React, { useState, useEffect, useRef } from 'react';
import {
  Sun,
  Cloud,
  Wind,
  CloudLightning,
  Zap,
  AlertTriangle,
  CheckCircle2,
  Activity,
  Gauge,
  Power,
  ShieldAlert,
  Volume2,
  VolumeX,
  RotateCcw,
  ArrowRight,
  Clock,
  Radio,
  Sliders,
  Layers,
  HelpCircle,
  X,
  User,
  Check,
  Compass,
} from 'lucide-react';

// --- TYPES & DEFINITIONS ---
export type WeatherType = 'sunny' | 'cloudy' | 'windy' | 'thunderstorm';

export interface WeatherProfile {
  id: WeatherType;
  name: string;
  icon: typeof Sun;
  description: string;
  shortDesc: string;
  ambientTemp: number; // Celsius
  windSpeed: number; // km/h
  lightningRisk: 'Low' | 'Moderate' | 'High' | 'Severe';
  rainIntensity: 'None' | 'Light' | 'Moderate' | 'Torrential';
  gridImpactSummary: string;
}

export interface GridParameters {
  voltageKV: number; // Nominal 330kV
  frequencyHz: number; // Nominal 50.0Hz
  generationMW: number;
  demandMW: number;
  reactivePowerMVAR: number;
  line1CurrentA: number;
  line1Status: 'NORMAL' | 'TRIPPED' | 'OVERLOAD';
  line2Status: 'NORMAL' | 'TRIPPED' | 'OVERLOAD';
  transformerLoadingPct: number;
  shuntReactorActive: boolean;
  spinningReserveMW: number;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  type: 'INFO' | 'WARNING' | 'CRITICAL' | 'ACTION';
  message: string;
  parameter?: string;
  value?: string;
}

const WEATHER_PROFILES: Record<WeatherType, WeatherProfile> = {
  sunny: {
    id: 'sunny',
    name: 'Clear / Sunny',
    icon: Sun,
    description: 'High solar insolation, ambient temp 34°C, minimal wind.',
    shortDesc: 'Stable base conditions with high solar generation.',
    ambientTemp: 34,
    windSpeed: 12,
    lightningRisk: 'Low',
    rainIntensity: 'None',
    gridImpactSummary: 'Nominal load flow, baseline transmission capacity, stable 330kV bus voltage.',
  },
  cloudy: {
    id: 'cloudy',
    name: 'Rapid Cloud Cover',
    icon: Cloud,
    description: 'Sudden cumulus cloud band sweeping solar PV corridors.',
    shortDesc: 'Rapid solar PV ramp-down causing sudden frequency dip if uncompensated.',
    ambientTemp: 28,
    windSpeed: 24,
    lightningRisk: 'Moderate',
    rainIntensity: 'Light',
    gridImpactSummary: 'Drop in distributed PV generation (~180 MW), grid frequency tends downward (49.7 Hz) before governor ramp-up.',
  },
  windy: {
    id: 'windy',
    name: 'High Wind / Gusts',
    icon: Wind,
    description: 'Gale-force gusts exceeding 65 km/h across transmission corridors.',
    shortDesc: 'Conductor mechanical swing, galloping lines, phase clearance risk.',
    ambientTemp: 23,
    windSpeed: 68,
    lightningRisk: 'Moderate',
    rainIntensity: 'Light',
    gridImpactSummary: 'Transmission line oscillations, dynamic line ratings fluctuate, high wind farm generation surge.',
  },
  thunderstorm: {
    id: 'thunderstorm',
    name: 'Thunderstorm & Torrential Rain',
    icon: CloudLightning,
    description: 'Severe convective storm with violent lightning, flash floods, and sudden load rejection.',
    shortDesc: 'Cascading line trips, Ferranti overvoltage (>340kV) & over-frequency (>51.0Hz).',
    ambientTemp: 19,
    windSpeed: 82,
    lightningRisk: 'Severe',
    rainIntensity: 'Torrential',
    gridImpactSummary: 'Sudden differential trip on 330kV feeder lines, abrupt 450MW load rejection accelerating turbine rotors to >51.0Hz, Ferranti effect surging primary voltage to >345kV.',
  },
};

export default function App() {
  // --- STATE ---
  const [currentWeather, setCurrentWeather] = useState<WeatherType>('sunny');
  const [anticipatedWeather, setAnticipatedWeather] = useState<WeatherType>('thunderstorm');
  const [autoSimulate, setAutoSimulate] = useState<boolean>(false);
  const [audioMuted, setAudioMuted] = useState<boolean>(true);

  // First-time user welcome guide modal state
  const [showWelcomeGuide, setShowWelcomeGuide] = useState<boolean>(() => {
    try {
      const seen = localStorage.getItem('gridpulse_welcomed');
      return !seen;
    } catch {
      return true;
    }
  });

  // Live Grid Parameters
  const [grid, setGrid] = useState<GridParameters>({
    voltageKV: 330.2,
    frequencyHz: 50.02,
    generationMW: 2450,
    demandMW: 2445,
    reactivePowerMVAR: 42,
    line1CurrentA: 840,
    line1Status: 'NORMAL',
    line2Status: 'NORMAL',
    transformerLoadingPct: 68,
    shuntReactorActive: false,
    spinningReserveMW: 320,
  });

  // Action states
  const [actionsTaken, setActionsTaken] = useState<{
    shuntReactor: boolean;
    generatorRampDown: boolean;
    line1Reclose: boolean;
  }>({
    shuntReactor: false,
    generatorRampDown: false,
    line1Reclose: false,
  });

  // Operational Sequence of Events Log
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: 'log-1',
      timestamp: new Date().toLocaleTimeString(),
      type: 'INFO',
      message: 'Grid operating in stable state. Primary 330kV Bus online at 330.2 kV, 50.02 Hz.',
    },
  ]);

  // Audio Beeper Ref
  const audioCtxRef = useRef<AudioContext | null>(null);

  const triggerAlarmSound = () => {
    if (audioMuted) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      }
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.35);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } catch {
      // Audio context might be restricted
    }
  };

  // Add Log Entry
  const addLog = (type: LogEntry['type'], message: string, parameter?: string, value?: string) => {
    setLogs((prev) => [
      {
        id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        timestamp: new Date().toLocaleTimeString(),
        type,
        message,
        parameter,
        value,
      },
      ...prev.slice(0, 39), // keep last 40 logs
    ]);
  };

  // Check Alarms
  const isHighVoltage = grid.voltageKV >= 340.0;
  const isLowVoltage = grid.voltageKV < 313.5;
  const isHighFrequency = grid.frequencyHz >= 51.0;
  const isLowFrequency = grid.frequencyHz < 49.5;
  const hasActiveAlarm = isHighVoltage || isHighFrequency || isLowVoltage || isLowFrequency || grid.line1Status === 'TRIPPED';

  // Sound alarm when severe condition occurs
  useEffect(() => {
    if (hasActiveAlarm && !audioMuted) {
      triggerAlarmSound();
    }
  }, [isHighVoltage, isHighFrequency, hasActiveAlarm, audioMuted]);

  // Handle weather changes and their physical impact on grid telemetry
  useEffect(() => {
    let targetVoltage = 330.0;
    let targetFreq = 50.0;
    let targetGen = 2450;
    let targetDemand = 2445;
    let line1St: 'NORMAL' | 'TRIPPED' | 'OVERLOAD' = 'NORMAL';
    let line2St: 'NORMAL' | 'TRIPPED' | 'OVERLOAD' = 'NORMAL';
    let line1Amp = 840;
    let txLoad = 68;

    if (currentWeather === 'sunny') {
      targetVoltage = 330.2;
      targetFreq = 50.02;
      targetGen = 2450;
      targetDemand = 2445;
      line1St = 'NORMAL';
      line2St = 'NORMAL';
      line1Amp = 840;
      txLoad = 65;
    } else if (currentWeather === 'cloudy') {
      targetVoltage = 328.5;
      targetFreq = 49.74;
      targetGen = 2270;
      targetDemand = 2445;
      line1St = 'NORMAL';
      line2St = 'NORMAL';
      line1Amp = 890;
      txLoad = 72;
    } else if (currentWeather === 'windy') {
      targetVoltage = 332.8;
      targetFreq = 50.35;
      targetGen = 2580;
      targetDemand = 2420;
      line1St = 'NORMAL';
      line2St = 'NORMAL';
      line1Amp = 960;
      txLoad = 78;
    } else if (currentWeather === 'thunderstorm') {
      // Severe thunderstorm: line 1 tripped by lightning surge, 450MW load rejected!
      if (!actionsTaken.line1Reclose) {
        line1St = 'TRIPPED';
        line1Amp = 0;
        line2St = 'OVERLOAD';
        targetDemand = 1990; // sudden drop of 455MW load
        txLoad = 94;

        // Load rejection causes massive over-frequency (generators accelerate)
        if (actionsTaken.generatorRampDown) {
          targetFreq = 50.25;
          targetGen = 2050;
        } else {
          targetFreq = 51.38; // > 51.0 Hz ALARM!
          targetGen = 2450;
        }

        // Long unloaded line creates capacitive Ferranti effect -> overvoltage
        if (actionsTaken.shuntReactor) {
          targetVoltage = 333.5;
        } else {
          targetVoltage = 346.8; // > 340.0 kV ALARM!
        }
      } else {
        // Line 1 reclosed
        line1St = 'NORMAL';
        line2St = 'NORMAL';
        line1Amp = 820;
        targetDemand = 2390;
        txLoad = 70;
        targetFreq = actionsTaken.generatorRampDown ? 49.95 : 50.15;
        targetVoltage = actionsTaken.shuntReactor ? 327.5 : 331.4;
      }
    }

    setGrid((prev) => ({
      ...prev,
      voltageKV: Number((targetVoltage + (Math.random() * 0.4 - 0.2)).toFixed(1)),
      frequencyHz: Number((targetFreq + (Math.random() * 0.04 - 0.02)).toFixed(2)),
      generationMW: Math.round(targetGen),
      demandMW: Math.round(targetDemand),
      line1Status: line1St,
      line2Status: line2St,
      line1CurrentA: line1Amp,
      transformerLoadingPct: txLoad,
      shuntReactorActive: actionsTaken.shuntReactor,
    }));
  }, [currentWeather, actionsTaken]);

  // Automated step simulation if enabled
  useEffect(() => {
    if (!autoSimulate) return;
    const interval = setInterval(() => {
      setGrid((prev) => {
        const driftV = (Math.random() - 0.5) * 0.3;
        const driftF = (Math.random() - 0.5) * 0.03;
        return {
          ...prev,
          voltageKV: Number((prev.voltageKV + driftV).toFixed(1)),
          frequencyHz: Number((prev.frequencyHz + driftF).toFixed(2)),
        };
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [autoSimulate]);

  // Switch weather handler
  const handleWeatherChange = (newWeather: WeatherType) => {
    setCurrentWeather(newWeather);
    addLog('INFO', `Weather changed to ${WEATHER_PROFILES[newWeather].name}. Assessing SCADA telemetry...`);
    if (newWeather === 'thunderstorm') {
      addLog('CRITICAL', 'SEVERE WEATHER FRONT DETECTED: 330kV Circuit 1 Diff Protection Tripped. Ferranti overvoltage & over-frequency contingency active!');
    }
  };

  // Immediate Operator Actions
  const handleSwitchShuntReactor = () => {
    const newState = !actionsTaken.shuntReactor;
    setActionsTaken((prev) => ({ ...prev, shuntReactor: newState }));
    if (newState) {
      addLog('ACTION', 'Operator switched IN 330kV 150MVAR Shunt Reactor Bank. Absorbing capacitive surge to suppress high bus voltage.', '330kV Shunt', 'ONLINE');
    } else {
      addLog('ACTION', 'Operator isolated 330kV Shunt Reactor Bank.', '330kV Shunt', 'OFFLINE');
    }
  };

  const handleGeneratorRampDown = () => {
    const newState = !actionsTaken.generatorRampDown;
    setActionsTaken((prev) => ({ ...prev, generatorRampDown: newState }));
    if (newState) {
      addLog('ACTION', 'Operator executed Fast Generation Ramp-down (-400MW) across hydro and gas turbines to arrest frequency acceleration.', 'Governor Dispatch', 'DELOAD -400MW');
    } else {
      addLog('ACTION', 'Generation ramp-down release. Restoring economic dispatch baseline.', 'Governor Dispatch', 'BASELINE');
    }
  };

  const handleLineReclose = () => {
    if (currentWeather !== 'thunderstorm') return;
    const newState = !actionsTaken.line1Reclose;
    setActionsTaken((prev) => ({ ...prev, line1Reclose: newState }));
    if (newState) {
      addLog('ACTION', 'Auto-Reclose Sequence executed on 330kV Circuit 1 after surge de-ionization. Transmission path restored.', 'Line 1 Breaker', 'CLOSED');
    } else {
      addLog('ACTION', 'Manual lockout on 330kV Circuit 1 Breaker initiated.', 'Line 1 Breaker', 'OPEN');
    }
  };

  const handleReset = () => {
    setCurrentWeather('sunny');
    setAnticipatedWeather('thunderstorm');
    setActionsTaken({ shuntReactor: false, generatorRampDown: false, line1Reclose: false });
    addLog('INFO', 'SCADA grid simulator reset to baseline sunny steady-state (330.0kV / 50.00Hz).');
  };

  // Anticipated Weather transition
  const handleApplyAnticipatedWeather = () => {
    handleWeatherChange(anticipatedWeather);
  };

  const handleDismissWelcome = () => {
    setShowWelcomeGuide(false);
    try {
      localStorage.setItem('gridpulse_welcomed', 'true');
    } catch {
      // ignore
    }
  };

  const currentProf = WEATHER_PROFILES[currentWeather];
  const anticipatedProf = WEATHER_PROFILES[anticipatedWeather];
  const CurrentIcon = currentProf.icon;
  const AnticipatedIcon = anticipatedProf.icon;

  return (
    <div id="gridpulse-root" className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased selection:bg-cyan-500 selection:text-black">
      {/* --- TOP SCADA NAVIGATION & STATUS BAR --- */}
      <header id="scada-topbar" className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-4 lg:px-8 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-cyan-950 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-inner">
              <Activity className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-lg tracking-wider text-slate-100 uppercase">GridPulse 330</span>
                <span className="text-xs px-2 py-0.5 rounded bg-cyan-950/80 text-cyan-300 font-mono border border-cyan-800/60">
                  SCADA EMS v4.8
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 font-mono border border-emerald-800/60 flex items-center gap-1">
                  <Radio className="w-3 h-3 animate-ping" /> LIVE TELEMETRY
                </span>
                <span className="text-xs px-2.5 py-0.5 rounded bg-slate-800/90 text-cyan-300 font-mono border border-slate-700 flex items-center gap-1">
                  <User className="w-3 h-3 text-cyan-400" /> Dev: <strong className="text-slate-100 font-semibold">Samuel Peter</strong>
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Nominal: 330.0 kV / 50.00 Hz | National Transmission Control Center
              </p>
            </div>
          </div>

          {/* Alarm Banner & Quick Actions */}
          <div className="flex items-center gap-3 flex-wrap">
            {hasActiveAlarm ? (
              <div
                id="alarm-indicator-active"
                className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-rose-950/90 border border-rose-600 text-rose-200 text-xs font-semibold animate-pulse shadow-lg shadow-rose-950/50"
              >
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>GRID CRITICAL ALARM: {isHighVoltage && 'VOLTAGE >340kV '} {isHighFrequency && 'FREQ >51.0Hz '} {grid.line1Status === 'TRIPPED' && 'LINE 1 TRIP'}</span>
              </div>
            ) : (
              <div
                id="alarm-indicator-normal"
                className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-emerald-950/80 border border-emerald-600/60 text-emerald-300 text-xs font-medium"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>SYSTEM BALANCED: All parameters within Grid Code</span>
              </div>
            )}

            {/* Audio alarm mute */}
            <button
              id="btn-toggle-audio"
              onClick={() => {
                setAudioMuted(!audioMuted);
                if (audioMuted) {
                  triggerAlarmSound();
                }
              }}
              title={audioMuted ? 'Unmute audible siren alarms' : 'Mute audible siren alarms'}
              className={`p-2 rounded-md border text-xs flex items-center gap-1.5 transition-colors ${
                audioMuted
                  ? 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                  : 'bg-rose-900/60 border-rose-500 text-rose-200'
              }`}
            >
              {audioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-rose-400 animate-bounce" />}
              <span className="hidden sm:inline">{audioMuted ? 'Muted' : 'Siren ON'}</span>
            </button>

            {/* Welcome & Operator Guide Toggle */}
            <button
              id="btn-open-guide"
              onClick={() => setShowWelcomeGuide(true)}
              className="px-3 py-1.5 rounded-md bg-cyan-950 hover:bg-cyan-900 border border-cyan-700 text-cyan-300 text-xs font-medium flex items-center gap-1.5 transition-all shadow-sm"
            >
              <HelpCircle className="w-4 h-4" />
              <span>Operator Guide</span>
            </button>
          </div>
        </div>
      </header>

      {/* --- FIRST-TIME USER WELCOME / ONBOARDING BANNER --- */}
      {showWelcomeGuide && (
        <div id="welcome-modal" className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-cyan-950 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
                  <Compass className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-100 text-base">Welcome to GridPulse 330</h3>
                  <p className="text-xs text-slate-400">Designed & Engineered by <span className="text-cyan-300 font-semibold">Samuel Peter</span></p>
                </div>
              </div>
              <button
                id="btn-close-welcome"
                onClick={handleDismissWelcome}
                className="text-slate-400 hover:text-slate-100 p-1.5 rounded-md hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto text-sm text-slate-300 leading-relaxed">
              <div className="bg-cyan-950/40 border border-cyan-800/60 rounded-lg p-3.5">
                <h4 className="font-semibold text-cyan-200 text-xs uppercase tracking-wider mb-1">What This App Does</h4>
                <p className="text-xs text-slate-300">
                  GridPulse 330 is a specialized DevOps Power Grid Monitoring & Alert Console built for National Control Center system operators. It models the acute physical impacts of rapid, unpredictable weather shifts on <strong>330kV transmission lines</strong> and <strong>50Hz grid frequency</strong>, alerting you before minor disturbances cascade into blackouts.
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-slate-100 text-xs uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" /> Main Features
                </h4>
                <ul className="space-y-2 text-xs text-slate-300">
                  <li className="flex items-start gap-2">
                    <span className="text-cyan-400 font-bold shrink-0">•</span>
                    <span><strong>Meteorological Contingency Radar:</strong> Tracks clear weather, sudden solar cloud cover, wind oscillations, and severe thunderstorms with heavy rainfall.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-cyan-400 font-bold shrink-0">•</span>
                    <span><strong>Threshold Alarms:</strong> Instant visual and audible sirens when 330kV Bus Voltage exceeds <strong>340.0 kV</strong> (Ferranti effect) or System Frequency exceeds <strong>51.00 Hz</strong> (load rejection).</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-cyan-400 font-bold shrink-0">•</span>
                    <span><strong>Cascading Line Protection:</strong> Real-time monitoring of double-circuit 330kV corridors with differential protection and thermal transfer overload warnings.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-cyan-400 font-bold shrink-0">•</span>
                    <span><strong>Operator Dispatch Action Playbook:</strong> Immediate execution controls to switch in 150MVAR Shunt Reactors, fast-deload generation (-400MW), and auto-reclose lines.</span>
                  </li>
                </ul>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-lg p-3.5">
                <h4 className="font-semibold text-amber-300 text-xs uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <ArrowRight className="w-3.5 h-3.5" /> Where to Start
                </h4>
                <ol className="list-decimal list-inside space-y-1 text-xs text-slate-300">
                  <li>Click <strong>&quot;Trigger Next-Moment Event&quot;</strong> in the Weather section to simulate a sudden thunderstorm front.</li>
                  <li>Observe the <strong>&gt;340kV High Voltage</strong> and <strong>&gt;51.0Hz High Frequency</strong> alarms firing.</li>
                  <li>Use the <strong>Operator Action Console</strong> below to switch in the Shunt Reactor and De-Load Generation to restore equilibrium!</li>
                </ol>
              </div>
            </div>

            <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
              <span className="text-xs text-slate-500 font-mono">GridPulse 330 • Developed by Samuel Peter</span>
              <button
                id="btn-get-started"
                onClick={handleDismissWelcome}
                className="px-5 py-2 rounded-md bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs flex items-center gap-2 transition shadow-md"
              >
                <span>Enter Operator Console</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MAIN DASHBOARD CONTAINER --- */}
      <main className="max-w-7xl mx-auto px-4 lg:px-8 py-6 space-y-6">
        {/* --- SECTION 1: WEATHER SITUATION & CONTINGENCY FORECAST --- */}
        <section id="weather-matrix-section" className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm uppercase tracking-wider font-semibold text-cyan-400">Meteorological Contingency Matrix</span>
                <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono">Real-time Weather Radar</span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Simulate unpredictable weather transitions (Sunny → Thunderstorm with torrential rain) and anticipate immediate impacts on 330kV transmission lines.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                id="btn-reset-sim"
                onClick={handleReset}
                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-300 flex items-center gap-1 transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Baseline</span>
              </button>

              <button
                id="btn-auto-sim"
                onClick={() => setAutoSimulate(!autoSimulate)}
                className={`px-3 py-1.5 rounded border text-xs flex items-center gap-1.5 transition ${
                  autoSimulate
                    ? 'bg-amber-950/80 border-amber-600 text-amber-300'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>{autoSimulate ? 'Telemetry Drift ON' : 'Telemetry Drift OFF'}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mt-4">
            {/* CURRENT WEATHER CONDITION */}
            <div className="lg:col-span-6 bg-slate-950/80 border border-slate-800/90 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-medium text-slate-400 uppercase">Current Operating Weather</span>
                <span className="text-xs font-mono text-cyan-400 bg-cyan-950 px-2 py-0.5 rounded border border-cyan-800">
                  {currentProf.ambientTemp}°C | Wind {currentProf.windSpeed} km/h
                </span>
              </div>

              <div className="flex items-center gap-4 mt-3">
                <div className={`p-3 rounded-lg border ${
                  currentWeather === 'thunderstorm'
                    ? 'bg-rose-950 border-rose-600 text-rose-400 animate-pulse'
                    : 'bg-slate-800/80 border-slate-700 text-amber-400'
                }`}>
                  <CurrentIcon className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-100">{currentProf.name}</h3>
                  <p className="text-xs text-slate-300 mt-0.5">{currentProf.description}</p>
                </div>
              </div>

              {/* Weather Selectors */}
              <div className="mt-4 pt-3 border-t border-slate-800/80">
                <div className="text-xs text-slate-400 mb-2 font-mono">Select Live State:</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(Object.keys(WEATHER_PROFILES) as WeatherType[]).map((wKey) => {
                    const prof = WEATHER_PROFILES[wKey];
                    const Icon = prof.icon;
                    const isActive = currentWeather === wKey;
                    return (
                      <button
                        key={wKey}
                        id={`btn-weather-${wKey}`}
                        onClick={() => handleWeatherChange(wKey)}
                        className={`px-2.5 py-2 rounded-md border text-xs font-medium flex flex-col items-center gap-1.5 transition-all text-center ${
                          isActive
                            ? 'bg-cyan-900/60 border-cyan-400 text-cyan-100 ring-1 ring-cyan-500'
                            : 'bg-slate-900/90 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                        }`}
                      >
                        <Icon className={`w-4 h-4 ${isActive ? 'text-cyan-300' : 'text-slate-400'}`} />
                        <span className="truncate w-full">{prof.name.split(' ')[0]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ANTICIPATED WEATHER PREDICTOR ("NEXT MOMENT") */}
            <div className="lg:col-span-6 bg-slate-950/80 border border-slate-800/90 rounded-lg p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-medium text-amber-400 uppercase flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" /> Anticipated Weather (Next Moment)
                  </span>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-amber-950/80 border border-amber-800/60 text-amber-300">
                    Radar Horizon: +15 Mins
                  </span>
                </div>

                <div className="flex items-center gap-4 mt-3">
                  <div className="p-3 rounded-lg bg-amber-950/50 border border-amber-700/60 text-amber-400">
                    <AnticipatedIcon className="w-8 h-8" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold text-slate-100">{anticipatedProf.name}</h3>
                      <span className="text-xs px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800">
                        Lightning: {anticipatedProf.lightningRisk}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mt-0.5">{anticipatedProf.shortDesc}</p>
                  </div>
                </div>

                <div className="mt-3 bg-slate-900/90 border border-slate-800 rounded p-2.5 text-xs text-slate-300 space-y-1 font-mono">
                  <div className="text-cyan-400 font-semibold">Predicted Grid Impact:</div>
                  <p className="text-slate-300 text-xs font-sans leading-relaxed">{anticipatedProf.gridImpactSummary}</p>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 w-full sm:w-auto">
                  <span className="text-xs text-slate-400 font-mono">Change Horizon:</span>
                  <select
                    id="select-anticipated-weather"
                    value={anticipatedWeather}
                    onChange={(e) => setAnticipatedWeather(e.target.value as WeatherType)}
                    className="bg-slate-900 border border-slate-700 text-xs text-slate-200 rounded px-2 py-1 font-mono focus:outline-none focus:border-cyan-500"
                  >
                    <option value="sunny">Sunny (Clear)</option>
                    <option value="cloudy">Rapid Cloud Cover</option>
                    <option value="windy">High Wind Gusts</option>
                    <option value="thunderstorm">Thunderstorm & Heavy Rain</option>
                  </select>
                </div>

                <button
                  id="btn-apply-anticipated"
                  onClick={handleApplyAnticipatedWeather}
                  className="w-full sm:w-auto px-3.5 py-1.5 rounded-md bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow transition"
                >
                  <span>Trigger Next-Moment Event</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* --- SECTION 2: TELEMETRY GAUGES (PRIMARY VOLTAGE & FREQUENCY) --- */}
        <section id="telemetry-gauges-section" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* GAUGE 1: PRIMARY BUS VOLTAGE (330kV Nominal, Alarm >340kV) */}
          <div
            id="card-bus-voltage"
            className={`rounded-xl p-5 border transition-all ${
              isHighVoltage
                ? 'bg-rose-950/80 border-rose-500 shadow-lg shadow-rose-950 ring-2 ring-rose-600/80 animate-pulse'
                : isLowVoltage
                ? 'bg-amber-950/80 border-amber-500 shadow-md'
                : 'bg-slate-900 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-mono text-slate-400">
              <span className="flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-cyan-400" />
                PRIMARY BUS VOLTAGE
              </span>
              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                NOMINAL: 330.0 kV
              </span>
            </div>

            <div className="mt-3 flex items-baseline justify-between">
              <div className="text-3xl lg:text-4xl font-black font-mono tracking-tight text-slate-100">
                {grid.voltageKV.toFixed(1)} <span className="text-base font-normal text-slate-400">kV</span>
              </div>
              <div className="text-right">
                <div
                  className={`text-xs font-bold font-mono px-2 py-0.5 rounded ${
                    isHighVoltage
                      ? 'bg-rose-600 text-white animate-bounce'
                      : isLowVoltage
                      ? 'bg-amber-600 text-black'
                      : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                  }`}
                >
                  {isHighVoltage ? 'HIGH ALARM (>340kV)' : isLowVoltage ? 'UNDER-VOLTAGE' : 'NORMAL (±5%)'}
                </div>
              </div>
            </div>

            {/* Threshold Bar */}
            <div className="mt-4">
              <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
                <span>313.5 kV (-5%)</span>
                <span className="text-cyan-400 font-semibold">330 kV</span>
                <span className="text-rose-400 font-bold">340.0 kV (TRIP)</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden relative">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, Math.max(5, ((grid.voltageKV - 300) / 60) * 100))}%`,
                    backgroundColor: isHighVoltage ? '#ef4444' : isLowVoltage ? '#f59e0b' : '#10b981',
                  }}
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-2 font-mono">
                {isHighVoltage
                  ? '⚠️ Ferranti Overvoltage risk! Heavy capacitive reactive power.'
                  : 'Voltage within statutory limits (313.5 - 340.0 kV).'}
              </p>
            </div>
          </div>

          {/* GAUGE 2: SYSTEM FREQUENCY (50.00Hz Nominal, Alarm >51.0Hz) */}
          <div
            id="card-system-frequency"
            className={`rounded-xl p-5 border transition-all ${
              isHighFrequency
                ? 'bg-rose-950/80 border-rose-500 shadow-lg shadow-rose-950 ring-2 ring-rose-600/80 animate-pulse'
                : isLowFrequency
                ? 'bg-amber-950/80 border-amber-500 shadow-md'
                : 'bg-slate-900 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-mono text-slate-400">
              <span className="flex items-center gap-1.5">
                <Gauge className="w-4 h-4 text-emerald-400" />
                GRID FREQUENCY
              </span>
              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                NOMINAL: 50.00 Hz
              </span>
            </div>

            <div className="mt-3 flex items-baseline justify-between">
              <div className="text-3xl lg:text-4xl font-black font-mono tracking-tight text-slate-100">
                {grid.frequencyHz.toFixed(2)} <span className="text-base font-normal text-slate-400">Hz</span>
              </div>
              <div className="text-right">
                <div
                  className={`text-xs font-bold font-mono px-2 py-0.5 rounded ${
                    isHighFrequency
                      ? 'bg-rose-600 text-white animate-bounce'
                      : isLowFrequency
                      ? 'bg-amber-600 text-black'
                      : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                  }`}
                >
                  {isHighFrequency ? 'HIGH ALARM (>51.0Hz)' : isLowFrequency ? 'UNDER-FREQ (<49.5)' : 'SYNCHRONIZED'}
                </div>
              </div>
            </div>

            {/* Threshold Bar */}
            <div className="mt-4">
              <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
                <span>49.50 Hz</span>
                <span className="text-emerald-400 font-semibold">50.00 Hz</span>
                <span className="text-rose-400 font-bold">51.00 Hz (TRIP)</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden relative">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, Math.max(5, ((grid.frequencyHz - 48.5) / 3.5) * 100))}%`,
                    backgroundColor: isHighFrequency ? '#ef4444' : isLowFrequency ? '#f59e0b' : '#10b981',
                  }}
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-2 font-mono">
                {isHighFrequency
                  ? '⚠️ Rotor acceleration! Generation excess over load rejection.'
                  : 'Governor loop locked within ±0.2 Hz statutory deadband.'}
              </p>
            </div>
          </div>

          {/* GAUGE 3: GENERATION VS DEMAND (ACTIVE POWER BALANCE) */}
          <div id="card-active-power" className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between text-xs font-mono text-slate-400">
              <span className="flex items-center gap-1.5">
                <Power className="w-4 h-4 text-amber-400" />
                ACTIVE POWER FLOW
              </span>
              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                MW BALANCE
              </span>
            </div>

            <div className="mt-3">
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="text-2xl font-bold font-mono text-slate-100">{grid.generationMW} <span className="text-xs text-slate-400">MW</span></div>
                  <div className="text-[11px] text-slate-400 font-mono">Total Generation</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold font-mono text-slate-100">{grid.demandMW} <span className="text-xs text-slate-400">MW</span></div>
                  <div className="text-[11px] text-slate-400 font-mono">System Load Demand</div>
                </div>
              </div>

              {/* Net Balance */}
              <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400">Net Power Imbalance:</span>
                <span className={`font-bold ${grid.generationMW - grid.demandMW > 150 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {grid.generationMW - grid.demandMW >= 0 ? `+${grid.generationMW - grid.demandMW}` : grid.generationMW - grid.demandMW} MW
                </span>
              </div>
              <div className="text-[11px] text-slate-400 mt-1 font-mono">
                Spinning Reserve: <span className="text-slate-200">{grid.spinningReserveMW} MW available</span>
              </div>
            </div>
          </div>

          {/* GAUGE 4: REACTIVE POWER & TRANSFORMER THERMAL */}
          <div id="card-reactive-power" className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between text-xs font-mono text-slate-400">
              <span className="flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-purple-400" />
                SUBSTATION ASSETS
              </span>
              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                330/132kV
              </span>
            </div>

            <div className="mt-3 space-y-3">
              <div>
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-slate-400">Tx 1 & 2 Thermal Load:</span>
                  <span className={`font-bold ${grid.transformerLoadingPct > 85 ? 'text-rose-400' : 'text-slate-200'}`}>
                    {grid.transformerLoadingPct}%
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-slate-800 mt-1 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${grid.transformerLoadingPct}%`,
                      backgroundColor: grid.transformerLoadingPct > 85 ? '#ef4444' : '#a855f7',
                    }}
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400">Reactive Power Q:</span>
                <span className="font-bold text-slate-200">{grid.reactivePowerMVAR} MVAR</span>
              </div>

              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400">330kV Shunt Reactor:</span>
                <span className={`px-2 py-0.5 rounded font-bold text-[11px] ${
                  actionsTaken.shuntReactor
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                    : 'bg-slate-800 text-slate-400'
                }`}>
                  {actionsTaken.shuntReactor ? 'IN SERVICE' : 'ISOLATED'}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* --- SECTION 3: TRANSMISSION CORRIDORS & CASCADING LINE STATUS --- */}
        <section id="transmission-corridors-section" className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-100">
                330kV Bulk Transmission Corridors (Cascading Trip Protection)
              </h3>
            </div>
            <span className="text-xs text-slate-400 font-mono">Double-Circuit Quad-Conductor</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            {/* CORRIDOR 1: 330kV LINE 1 */}
            <div
              id="corridor-line-1"
              className={`p-4 rounded-lg border transition-all ${
                grid.line1Status === 'TRIPPED'
                  ? 'bg-rose-950/60 border-rose-600 ring-1 ring-rose-500'
                  : 'bg-slate-950/70 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm text-slate-100 font-mono">330kV Line 1: Ikeja West - Oshogbo</h4>
                  <p className="text-xs text-slate-400">Differential Distance Relay 21 / Auto-Reclose</p>
                </div>
                <span
                  className={`text-xs px-2.5 py-1 rounded font-bold font-mono tracking-wide ${
                    grid.line1Status === 'TRIPPED'
                      ? 'bg-rose-600 text-white animate-pulse'
                      : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                  }`}
                >
                  {grid.line1Status === 'TRIPPED' ? 'TRIPPED (LOCKOUT)' : 'CLOSED (HEALTHY)'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-800 text-xs font-mono">
                <div>
                  <span className="text-slate-500 block">Current</span>
                  <span className="font-bold text-slate-200">{grid.line1CurrentA} Amps</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Surge Impedance</span>
                  <span className="font-bold text-slate-200">385 Ω</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Condition</span>
                  <span className={grid.line1Status === 'TRIPPED' ? 'text-rose-400 font-bold' : 'text-emerald-400'}>
                    {grid.line1Status === 'TRIPPED' ? 'Lightning Fault' : 'Synchronous'}
                  </span>
                </div>
              </div>

              {grid.line1Status === 'TRIPPED' && (
                <div className="mt-3 p-2.5 rounded bg-rose-900/40 border border-rose-800/80 text-xs text-rose-200 flex items-center justify-between">
                  <span>Lightning struck tower #142 during thunderstorm. 450MW disconnected!</span>
                  <button
                    id="btn-reclose-line1"
                    onClick={handleLineReclose}
                    className="px-2.5 py-1 rounded bg-rose-700 hover:bg-rose-600 text-white font-mono text-[11px] font-bold"
                  >
                    Initiate Reclosing
                  </button>
                </div>
              )}
            </div>

            {/* CORRIDOR 2: 330kV LINE 2 */}
            <div
              id="corridor-line-2"
              className={`p-4 rounded-lg border transition-all ${
                grid.line2Status === 'OVERLOAD'
                  ? 'bg-amber-950/60 border-amber-600 ring-1 ring-amber-500'
                  : 'bg-slate-950/70 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm text-slate-100 font-mono">330kV Line 2: Ikeja West - Oshogbo (Parallel)</h4>
                  <p className="text-xs text-slate-400">Continuous Thermal Rating: 1,450 A</p>
                </div>
                <span
                  className={`text-xs px-2.5 py-1 rounded font-bold font-mono tracking-wide ${
                    grid.line2Status === 'OVERLOAD'
                      ? 'bg-amber-600 text-slate-950 font-black'
                      : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                  }`}
                >
                  {grid.line2Status === 'OVERLOAD' ? 'HEAVILY LOADED' : 'CLOSED (HEALTHY)'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-800 text-xs font-mono">
                <div>
                  <span className="text-slate-500 block">Current</span>
                  <span className={`font-bold ${grid.line2Status === 'OVERLOAD' ? 'text-amber-300' : 'text-slate-200'}`}>
                    {grid.line2Status === 'OVERLOAD' ? '1,320 Amps' : '780 Amps'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Thermal Reserve</span>
                  <span className="font-bold text-slate-200">{grid.line2Status === 'OVERLOAD' ? '91%' : '54%'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Condition</span>
                  <span className={grid.line2Status === 'OVERLOAD' ? 'text-amber-400' : 'text-emerald-400'}>
                    {grid.line2Status === 'OVERLOAD' ? 'N-1 Contingency' : 'Normal Flow'}
                  </span>
                </div>
              </div>

              {grid.line2Status === 'OVERLOAD' && (
                <div className="mt-3 p-2.5 rounded bg-amber-950/60 border border-amber-800/80 text-xs text-amber-200">
                  Carrying diverted power from tripped Line 1. Must prevent thermal trip on Line 2!
                </div>
              )}
            </div>
          </div>
        </section>

        {/* --- SECTION 4: OPERATOR IMMEDIATE DISPATCH CONTROLS & CONTINGENCY PLAYBOOK --- */}
        <section id="operator-dispatch-section" className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-800">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-cyan-400 flex items-center gap-2">
                <Sliders className="w-4 h-4" /> Immediate Operator Action Console
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Standard Operating Procedures (SOP) to arrest high bus voltage (&gt;340kV) and excessive frequency (&gt;51.0Hz).
              </p>
            </div>
            <span className="text-xs font-mono text-slate-400 bg-slate-800 px-2 py-1 rounded">
              Interlock Status: Ready
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            {/* ACTION 1: SHUNT REACTOR BANK SWITCHING */}
            <div className="p-4 rounded-lg bg-slate-950/80 border border-slate-800 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-cyan-400 font-bold">REMEDY 1: HIGH VOLTAGE (&gt;340kV)</span>
                  <span className={actionsTaken.shuntReactor ? 'text-emerald-400' : 'text-slate-500'}>
                    {actionsTaken.shuntReactor ? 'ENGAGED' : 'STANDBY'}
                  </span>
                </div>
                <h4 className="font-bold text-slate-100 text-sm mt-1">330kV 150MVAR Shunt Reactor Bank</h4>
                <p className="text-xs text-slate-400 mt-1">
                  Neutralizes the capacitive Ferranti charging currents on unloaded transmission lines during rain/storm conditions. Drops bus voltage from ~347kV to ~333kV.
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800">
                <button
                  id="btn-action-shunt"
                  onClick={handleSwitchShuntReactor}
                  className={`w-full py-2 px-3 rounded-md text-xs font-bold font-mono flex items-center justify-center gap-2 transition ${
                    actionsTaken.shuntReactor
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-slate-950'
                      : 'bg-cyan-700 hover:bg-cyan-600 text-white shadow-md'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>{actionsTaken.shuntReactor ? '✓ Shunt Reactor Connected (Voltage Normalized)' : '⚡ Switch IN 330kV Shunt Reactor'}</span>
                </button>
              </div>
            </div>

            {/* ACTION 2: FAST GENERATION RAMP-DOWN / DELOAD */}
            <div className="p-4 rounded-lg bg-slate-950/80 border border-slate-800 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-amber-400 font-bold">REMEDY 2: HIGH FREQ (&gt;51.0Hz)</span>
                  <span className={actionsTaken.generatorRampDown ? 'text-emerald-400' : 'text-slate-500'}>
                    {actionsTaken.generatorRampDown ? 'ENGAGED' : 'STANDBY'}
                  </span>
                </div>
                <h4 className="font-bold text-slate-100 text-sm mt-1">Fast Turbine Governor De-Load (-400MW)</h4>
                <p className="text-xs text-slate-400 mt-1">
                  When line trips reject major city loads, generator shafts overspeed (&gt;51.0Hz). Fast deloading arrests governor trip lockouts and restores 50.0Hz.
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800">
                <button
                  id="btn-action-deload"
                  onClick={handleGeneratorRampDown}
                  className={`w-full py-2 px-3 rounded-md text-xs font-bold font-mono flex items-center justify-center gap-2 transition ${
                    actionsTaken.generatorRampDown
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-slate-950'
                      : 'bg-amber-600 hover:bg-amber-500 text-slate-950 shadow-md'
                  }`}
                >
                  <Gauge className="w-3.5 h-3.5" />
                  <span>{actionsTaken.generatorRampDown ? '✓ Generation De-loaded (50.0Hz Restored)' : '📉 Ramp-Down Generation (-400MW)'}</span>
                </button>
              </div>
            </div>

            {/* ACTION 3: TRANSMISSION LINE AUTO-RECLOSE / RESTORATION */}
            <div className="p-4 rounded-lg bg-slate-950/80 border border-slate-800 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-purple-400 font-bold">REMEDY 3: LINE RESTORATION</span>
                  <span className={actionsTaken.line1Reclose ? 'text-emerald-400' : 'text-slate-500'}>
                    {actionsTaken.line1Reclose ? 'RECLOSED' : 'TRIPPED'}
                  </span>
                </div>
                <h4 className="font-bold text-slate-100 text-sm mt-1">Post-Lightning Synchro-Check Reclose</h4>
                <p className="text-xs text-slate-400 mt-1">
                  Verify de-ionization of arc channel on 330kV Line 1. Execute synchro-check breaker reclose to balance load flow across parallel circuits.
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800">
                <button
                  id="btn-action-restore"
                  onClick={handleLineReclose}
                  disabled={currentWeather !== 'thunderstorm'}
                  className={`w-full py-2 px-3 rounded-md text-xs font-bold font-mono flex items-center justify-center gap-2 transition ${
                    currentWeather !== 'thunderstorm'
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      : actionsTaken.line1Reclose
                      ? 'bg-emerald-600 text-slate-950'
                      : 'bg-purple-700 hover:bg-purple-600 text-white'
                  }`}
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>
                    {currentWeather !== 'thunderstorm'
                      ? 'Line 1 is Healthy'
                      : actionsTaken.line1Reclose
                      ? '✓ Line 1 Reclosed & Synchronized'
                      : '🔄 Execute Synchro-Check Reclose'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* --- SECTION 5: SEQUENCE OF EVENTS (SOE) LOG --- */}
        <section id="soe-logs-section" className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-100 font-mono">
                Sequence of Events (SOE) & Alarm Dispatch Log
              </h3>
            </div>
            <button
              onClick={() => setLogs([])}
              className="text-xs text-slate-400 hover:text-slate-200 font-mono"
            >
              Clear Log
            </button>
          </div>

          <div className="mt-3 max-h-56 overflow-y-auto space-y-1.5 font-mono text-xs pr-1">
            {logs.length === 0 ? (
              <div className="text-slate-500 text-center py-6">No recent events. System running nominal.</div>
            ) : (
              logs.map((log) => (
                <div
                  key={log.id}
                  className={`p-2 rounded border flex items-start gap-3 transition-colors ${
                    log.type === 'CRITICAL'
                      ? 'bg-rose-950/70 border-rose-800/80 text-rose-200'
                      : log.type === 'WARNING'
                      ? 'bg-amber-950/70 border-amber-800/80 text-amber-200'
                      : log.type === 'ACTION'
                      ? 'bg-emerald-950/70 border-emerald-800/80 text-emerald-200'
                      : 'bg-slate-950/70 border-slate-800/80 text-slate-300'
                  }`}
                >
                  <span className="text-slate-500 shrink-0 select-none">[{log.timestamp}]</span>
                  <span
                    className={`font-bold shrink-0 px-1.5 py-0.5 rounded text-[10px] ${
                      log.type === 'CRITICAL'
                        ? 'bg-rose-600 text-white'
                        : log.type === 'WARNING'
                        ? 'bg-amber-600 text-black'
                        : log.type === 'ACTION'
                        ? 'bg-emerald-600 text-slate-950'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {log.type}
                  </span>
                  <span className="flex-1">{log.message}</span>
                  {log.parameter && (
                    <span className="text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 text-[10px]">
                      {log.parameter}: {log.value}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
      </main>

      {/* --- FOOTER ATTRIBUTION --- */}
      <footer className="border-t border-slate-900 bg-slate-950/80 py-4 px-4 lg:px-8 text-center text-xs text-slate-500 font-mono">
        <p>GridPulse 330 • Developed by <span className="text-slate-300 font-semibold">Samuel Peter</span> • Power Grid DevOps EMS</p>
      </footer>
    </div>
  );
}
