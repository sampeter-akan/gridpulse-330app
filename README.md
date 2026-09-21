# GridPulse 330 — DevOps Power Grid Monitoring & Alert Console

**Developed by:** Samuel Peter  
**Focus:** 330kV Bulk Transmission & 50Hz Frequency Contingency Management

## Overview
GridPulse 330 is a real-time SCADA Energy Management System (EMS) simulation console designed for National Control Center transmission operators. It detects and mitigates acute disturbances caused by unpredictable weather transitions (such as sunny conditions rapidly deteriorating into severe thunderstorms).

## Key Features
- **Meteorological Contingency Matrix**: Tracks real-time radar horizons (Sunny, Rapid Cloud Cover, High Winds, Severe Thunderstorms).
- **Physical Grid Telemetry**: Real-time modeling of 330kV nominal bus voltages, 50.00Hz frequency, MW load/generation balance, and MVAR reactive power.
- **Automated SCADA Alarms**:
  - High Voltage Alarm (>340.0 kV) triggered by Ferranti capacitive effects on unloaded lines.
  - High Frequency Alarm (>51.00 Hz) triggered by sudden load rejection.
  - Transmission line differential protection lockout.
- **Operator Action Playbook**:
  - Switch IN 330kV 150MVAR Shunt Reactors.
  - Fast-deload turbine governors (-400MW).
  - Synchro-check auto-reclose sequences.

## Running Locally
```bash
npm install
npm run dev
