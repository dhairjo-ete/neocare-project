"""
NeoCare - Neonatal Vitals Sensor Simulator (Patient-Aware Edition)
Streams vitals ONLY for incubators that have an actively admitted patient.
Empty / standby beds are kept silent — no phantom readings, no false alarms.

Flow:
  1. On every refresh cycle, query backend API for occupied incubators.
  2. Only publish vitals for devices with an admitted patient.
  3. Publish a standby status for empty active beds (no infant data).
  4. When a patient is admitted via the Web Dashboard, the simulator picks
     it up automatically on the next discovery tick.
  5. When a patient is discharged, the device automatically goes silent.
"""

import argparse
import json
import os
import random
import ssl
import sys
import threading
import time
from datetime import datetime, timezone

import paho.mqtt.client as mqtt

try:
    import requests as _requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False
    print("[warn] 'requests' library not found — will run in offline/manual device mode.")
    print("[warn] Install it: pip install requests")

try:
    from dotenv import load_dotenv
    load_dotenv(override=True)
except ImportError:
    pass

BROKER_HOST  = os.environ.get("HIVEMQ_HOST",     "REPLACE_WITH_YOUR_CLUSTER_URL")
BROKER_PORT  = int(os.environ.get("HIVEMQ_PORT", 8883))
USERNAME     = os.environ.get("HIVEMQ_USERNAME",  "REPLACE_WITH_YOUR_USERNAME")
PASSWORD     = os.environ.get("HIVEMQ_PASSWORD",  "REPLACE_WITH_YOUR_PASSWORD")
BACKEND_URL  = os.environ.get("NEOCARE_BACKEND_URL", "http://localhost:5000")
# Service credential for the simulator, NOT a user login token - must match
# SIMULATOR_API_KEY in backend/.env exactly. See backend/.env.example for how
# to generate one. This has no expiry, unlike a user JWT.
SIMULATOR_API_KEY = os.environ.get("SIMULATOR_API_KEY", "")

# Global anomaly overrides
ACTIVE_ANOMALY: dict = {}

ANOMALY_TYPES = {
    "1": ("bradycardia",   "Authentic Apnea-Bradycardia Cascade (Desat -> Vagal HR Drop -> Recovery)"),
    "2": ("tachycardia",   "Tachycardia Trajectory (Gradual smooth climb to HR > 185 bpm)"),
    "3": ("hypoxia",       "Hypoxic Desaturation (Smooth SpO2 drop < 85% + compensatory HR)"),
    "4": ("hyperthermia",  "Hyperthermia / Fever (Temp rises > 38.5 °C + incubator cooling)"),
    "5": ("hypothermia",   "Hypothermia Drift (Temp drops < 35.5 °C + incubator heater response)"),
    "0": (None,            "Normal Physiology (Restore healthy circadian sleep/wake rhythm)"),
}


# ---------------------------------------------------------------------------
# Clinical Syndrome Profiles & Behavioral State Configurations
# ---------------------------------------------------------------------------

SYNDROME_PROFILES = {
    "respiratory_distress": {
        "name": "Respiratory Distress Syndrome",
        "base_hr": 145.0,
        "base_spo2": 95.5,         # Target saturation maintained under incubator respiratory support
        "base_temp": 37.0,
        "hr_sigma": 1.2,
        "spo2_sigma": 0.35,
        "spontaneous_risk": 0.004, # Event occurs realistically (~once every 15-20 min)
        "primary_risk": "bradycardia",
    },
    "meconium_aspiration": {
        "name": "Meconium Aspiration Syndrome",
        "base_hr": 148.0,
        "base_spo2": 95.2,
        "base_temp": 37.1,
        "hr_sigma": 1.2,
        "spo2_sigma": 0.35,
        "spontaneous_risk": 0.004,
        "primary_risk": "hypoxia",
    },
    "suspected_sepsis": {
        "name": "Suspected Sepsis",
        "base_hr": 160.0,
        "base_spo2": 96.0,
        "base_temp": 37.5,
        "hr_sigma": 0.75,
        "spo2_sigma": 0.35,
        "spontaneous_risk": 0.005,
        "primary_risk": "hyperthermia",
    },
    "prematurity": {
        "name": "Prematurity / Low Birth Weight",
        "base_hr": 150.0,
        "base_spo2": 96.5,
        "base_temp": 36.8,
        "hr_sigma": 1.2,
        "spo2_sigma": 0.35,
        "spontaneous_risk": 0.005,
        "primary_risk": "bradycardia", # Apnea of prematurity
    },
    "birth_asphyxia": {
        "name": "Birth Asphyxia",
        "base_hr": 134.0,
        "base_spo2": 95.8,
        "base_temp": 36.6,
        "hr_sigma": 1.1,
        "spo2_sigma": 0.35,
        "spontaneous_risk": 0.004,
        "primary_risk": "hypoxia",
    },
    "congenital_heart_defect": {
        "name": "Congenital Heart Defect",
        "base_hr": 154.0,
        "base_spo2": 95.0,
        "base_temp": 36.9,
        "hr_sigma": 1.2,
        "spo2_sigma": 0.4,
        "spontaneous_risk": 0.003,
        "primary_risk": "hypoxia",
    },
    "jaundice": {
        "name": "Jaundice (Hyperbilirubinemia)",
        "base_hr": 138.0,
        "base_spo2": 98.0,
        "base_temp": 37.0,
        "hr_sigma": 1.4,
        "spo2_sigma": 0.25,
        "spontaneous_risk": 0.002,
        "primary_risk": "bradycardia",
    },
    "default": {
        "name": "General NICU Observation",
        "base_hr": 140.0,
        "base_spo2": 97.5,
        "base_temp": 37.0,
        "hr_sigma": 1.3,
        "spo2_sigma": 0.25,
        "spontaneous_risk": 0.002,
        "primary_risk": "bradycardia",
    },
}

def get_syndrome_profile(syndrome_str: str) -> dict:
    if not syndrome_str:
        return SYNDROME_PROFILES["default"]
    s = str(syndrome_str).lower()
    if "respiratory" in s or "rds" in s or "hyaline" in s:
        return SYNDROME_PROFILES["respiratory_distress"]
    if "meconium" in s:
        return SYNDROME_PROFILES["meconium_aspiration"]
    if "sepsis" in s or "infect" in s:
        return SYNDROME_PROFILES["suspected_sepsis"]
    if "prematur" in s or "low birth" in s or "lbw" in s or "vlbw" in s:
        return SYNDROME_PROFILES["prematurity"]
    if "asphyxia" in s or "hypoxic" in s or "hie" in s:
        return SYNDROME_PROFILES["birth_asphyxia"]
    if "heart" in s or "cardiac" in s or "chd" in s:
        return SYNDROME_PROFILES["congenital_heart_defect"]
    if "jaundice" in s or "hyperbilirubin" in s or "phototherapy" in s:
        return SYNDROME_PROFILES["jaundice"]
    return SYNDROME_PROFILES["default"]


PENDING_CONTROLS: dict = {}


# ---------------------------------------------------------------------------
# Neonate Physiology Engine (Continuous Autoregressive Digital Twin)
# ---------------------------------------------------------------------------

class NeonatePhysiology:
    """
    Simulates continuous physiological state for a specific admitted neonate.
    Features:
      - Autoregressive momentum (AR-1): smooth physiological continuity with micro-variability.
      - Syndrome-driven baselines and risk factors (RDS, Sepsis, Preterm, Jaundice, etc.).
      - Sleep/Wake behavioral cycles: Deep Sleep (NREM), Active Sleep (REM), Awake/Calm, Agitated/Crying.
      - Multi-stage Causal Apnea-Bradycardia-Desaturation (ABD) cascade.
      - Dual-zone thermal physics: Infant skin probe temperature vs. incubator air temperature.
      - Hardware-in-the-Loop (HIL): Responds dynamically to clinician commands from web dashboard.
    """
    def __init__(self, device_id: str, patient_info: dict = None):
        self.device_id = device_id
        self.patient_info = patient_info or {}

        syndrome = str(self.patient_info.get("primarySyndrome") or "")
        self.profile = get_syndrome_profile(syndrome)

        # Continuous state variables (initialized to diagnosis baseline)
        self.hr = float(self.profile["base_hr"])
        self.spo2 = float(self.profile["base_spo2"])
        self.skin_temp = float(self.profile["base_temp"])
        self.heater_power = 50
        self.fan_speed = 1200
        self.oxygen_flow = 2.0

        # Hardware-in-the-Loop (HIL) Actuator Setpoints
        self.target_skin_temp = float(self.profile["base_temp"])
        self.target_oxygen_flow = 2.0
        self.phototherapy = False

        # Apply any pending control settings pre-cached from API discovery
        if device_id in PENDING_CONTROLS:
            init_ctrl = PENDING_CONTROLS[device_id]
            self.apply_control(
                init_ctrl.get("targetTemperature"),
                init_ctrl.get("oxygenFlow"),
                init_ctrl.get("phototherapy"),
            )

        # Behavioral state machine
        self.behavior = "deep_sleep"
        self.behavior_ticks_left = random.randint(40, 80)

        # Multi-stage anomaly cascade tracking
        self.active_anomaly = None
        self.anomaly_step = 0
        self.anomaly_total_steps = 0
        self.last_condition_label = "Normal"

    def apply_control(self, target_temp=None, oxygen_flow=None, phototherapy=None):
        """Clinician actuator command applied from web dashboard."""
        if target_temp is not None:
            self.target_skin_temp = float(target_temp)
        if oxygen_flow is not None:
            self.target_oxygen_flow = max(1.0, min(10.0, float(oxygen_flow)))
        if phototherapy is not None:
            self.phototherapy = bool(phototherapy)

    def update_patient_info(self, patient_info: dict):
        if patient_info:
            new_syn = str(patient_info.get("primarySyndrome") or "")
            old_syn = str(self.patient_info.get("primarySyndrome") or "")
            if new_syn != old_syn:
                self.patient_info = patient_info
                self.profile = get_syndrome_profile(new_syn)

    def _update_behavior(self):
        self.behavior_ticks_left -= 1
        if self.behavior_ticks_left <= 0:
            current = self.behavior
            r = random.random()
            if current == "deep_sleep":
                self.behavior = "active_sleep" if r < 0.85 else "awake_calm"
                self.behavior_ticks_left = random.randint(40, 80)
            elif current == "active_sleep":
                if r < 0.55:
                    self.behavior = "deep_sleep"
                elif r < 0.85:
                    self.behavior = "awake_calm"
                else:
                    self.behavior = "agitated_crying"
                self.behavior_ticks_left = random.randint(30, 60)
            elif current == "awake_calm":
                if r < 0.50:
                    self.behavior = "active_sleep"
                elif r < 0.80:
                    self.behavior = "deep_sleep"
                else:
                    self.behavior = "agitated_crying"
                self.behavior_ticks_left = random.randint(20, 40)
            else:  # agitated_crying
                self.behavior = "awake_calm" if r < 0.75 else "active_sleep"
                self.behavior_ticks_left = random.randint(15, 30)

    def _start_anomaly(self, anomaly_type: str):
        self.active_anomaly = anomaly_type
        self.anomaly_step = 0
        if anomaly_type == "bradycardia":
            # Multi-stage Apnea-Bradycardia-Desaturation cascade (16 ticks = 48s)
            self.anomaly_total_steps = 16
        elif anomaly_type == "tachycardia":
            self.anomaly_total_steps = 18
        elif anomaly_type == "hypoxia":
            self.anomaly_total_steps = 16
        elif anomaly_type == "hyperthermia":
            self.anomaly_total_steps = 22
        elif anomaly_type == "hypothermia":
            self.anomaly_total_steps = 22
        else:
            self.active_anomaly = None
            self.anomaly_total_steps = 0

    def _compute_targets(self):
        base_hr = self.profile["base_hr"]
        base_spo2 = self.profile["base_spo2"]
        base_temp = self.profile["base_temp"]

        # Behavioral baseline modifiers
        if self.behavior == "deep_sleep":
            beh_hr_mod = -9.0
            beh_spo2_mod = 0.8
            beh_sigma_mult = 0.6
        elif self.behavior == "active_sleep":
            beh_hr_mod = 0.0
            beh_spo2_mod = 0.0
            beh_sigma_mult = 1.0
        elif self.behavior == "awake_calm":
            beh_hr_mod = 8.0
            beh_spo2_mod = -0.3
            beh_sigma_mult = 1.2
        else:  # agitated_crying
            beh_hr_mod = 30.0
            beh_spo2_mod = -2.2
            beh_sigma_mult = 2.0

        target_hr = base_hr + beh_hr_mod

        # Hardware-in-the-Loop: Supplemental oxygen effect
        # Ambient flow is 2.0 L/min. Clinician-prescribed flow provides arterial oxygenation boost:
        o2_delta = self.target_oxygen_flow - 2.0
        o2_boost = o2_delta * 1.3
        target_spo2 = min(100.0, base_spo2 + beh_spo2_mod + o2_boost)

        # Incubator servo drives toward clinician's target skin temperature
        target_temp = self.target_skin_temp
        condition = "Normal"
        is_anomaly = False

        if self.active_anomaly == "bradycardia":
            # ── Causal Apnea-Bradycardia-Desaturation (ABD) Cascade ──
            step = self.anomaly_step
            if step <= 3:
                # Phase 1: Onset Apneic Pause (0-9s) - SpO2 begins to slide
                target_spo2 = base_spo2 - (step * 1.5)
                target_hr = base_hr - (step * 3.0)
                condition = "Normal"
                is_anomaly = False
            elif step <= 7:
                # Phase 2: Hypoxic Desaturation (10-21s) - SpO2 drops rapidly
                target_spo2 = max(78.0, 89.0 - ((step - 3) * 2.8))
                target_hr = max(90.0, base_hr - 15.0 - ((step - 3) * 10.0))
                condition = "Hypoxia"
                is_anomaly = True
            elif step <= 11:
                # Phase 3: Secondary Vagal Bradycardia (22-33s) - Heart rate plunges
                target_hr = 66.0 + random.uniform(-4.0, 4.0)
                target_spo2 = 80.0 + random.uniform(-2.0, 3.0)
                condition = "Bradycardia"
                is_anomaly = True
            else:
                # Phase 4: Clinical Recovery (34-48s) - Oxygen & breathing recover
                rec_progress = (step - 11) / 5.0
                target_hr = 70.0 + (rec_progress * (base_hr - 70.0))
                target_spo2 = 82.0 + (rec_progress * (base_spo2 - 82.0))
                condition = "Recovering" if rec_progress < 0.7 else "Normal"
                is_anomaly = False

        elif self.active_anomaly == "tachycardia":
            # Smooth escalation to high sustained heart rate
            step = self.anomaly_step
            if step <= 6:
                target_hr = base_hr + (step * 8.0)
            elif step <= 14:
                target_hr = 192.0 + random.uniform(-4.0, 5.0)
                target_temp = base_temp + 0.3
            else:
                rec_progress = (step - 14) / 4.0
                target_hr = 192.0 - (rec_progress * (192.0 - base_hr))
            condition = "Tachycardia" if target_hr > 178 else "Normal"
            is_anomaly = target_hr > 178

        elif self.active_anomaly == "hypoxia":
            # Respiratory desaturation with initial compensatory tachycardia
            step = self.anomaly_step
            if step <= 5:
                target_spo2 = base_spo2 - (step * 2.8)
                target_hr = base_hr + (step * 4.0)
            elif step <= 12:
                target_spo2 = 82.0 + random.uniform(-2.5, 2.5)
                target_hr = base_hr + 20.0
            else:
                rec_progress = (step - 12) / 4.0
                target_spo2 = 82.0 + (rec_progress * (base_spo2 - 82.0))
                target_hr = (base_hr + 20.0) - (rec_progress * 20.0)
            condition = "Hypoxia" if target_spo2 < 89 else "Normal"
            is_anomaly = target_spo2 < 89

        elif self.active_anomaly == "hyperthermia":
            step = self.anomaly_step
            if step <= 8:
                target_temp = base_temp + (step * 0.22)
                target_hr = base_hr + (step * 3.5)
            elif step <= 16:
                target_temp = 38.9 + random.uniform(-0.15, 0.2)
                target_hr = base_hr + 32.0
            else:
                rec_progress = (step - 16) / 6.0
                target_temp = 38.9 - (rec_progress * (38.9 - base_temp))
                target_hr = (base_hr + 32.0) - (rec_progress * 32.0)
            condition = "Hyperthermia" if target_temp > 38.3 else "Normal"
            is_anomaly = target_temp > 38.3

        elif self.active_anomaly == "hypothermia":
            step = self.anomaly_step
            if step <= 8:
                target_temp = base_temp - (step * 0.22)
                target_hr = base_hr - (step * 4.0)
            elif step <= 16:
                target_temp = 35.1 + random.uniform(-0.2, 0.2)
                target_hr = 108.0 + random.uniform(-3.0, 3.0)
            else:
                rec_progress = (step - 16) / 6.0
                target_temp = 35.1 + (rec_progress * (base_temp - 35.1))
                target_hr = 108.0 + (rec_progress * (base_hr - 108.0))
            condition = "Hypothermia" if target_temp < 35.7 else "Normal"
            is_anomaly = target_temp < 35.7

        return target_hr, target_spo2, target_temp, condition, is_anomaly, beh_sigma_mult

    def step(self, forced_anomaly: str = None) -> dict:
        # 1. Update behavioral state
        self._update_behavior()

        # 2. Check for anomaly (forced override or spontaneous)
        if forced_anomaly:
            if self.active_anomaly != forced_anomaly:
                self._start_anomaly(forced_anomaly)
        elif self.active_anomaly is None:
            # Spontaneous anomaly chance based on admitted syndrome risk
            spontaneous_chance = self.profile.get("spontaneous_risk", 0.02)
            if random.random() < spontaneous_chance:
                chosen = self.profile.get("primary_risk", "bradycardia")
                self._start_anomaly(chosen)

        # 3. Calculate target setpoints
        target_hr, target_spo2, target_temp, condition, is_anomaly, sigma_mult = self._compute_targets()

        # 4. Apply Autoregressive Momentum (AR-1) with biological noise
        alpha_hr = 0.78
        alpha_spo2 = 0.82
        alpha_temp = 0.94  # Body core changes slowly with thermal mass

        hr_noise = random.gauss(0, self.profile["hr_sigma"] * sigma_mult)
        spo2_noise = random.gauss(0, self.profile["spo2_sigma"] * sigma_mult)
        temp_noise = random.gauss(0, 0.02)

        self.hr = (alpha_hr * self.hr) + ((1.0 - alpha_hr) * target_hr) + hr_noise
        self.spo2 = (alpha_spo2 * self.spo2) + ((1.0 - alpha_spo2) * target_spo2) + spo2_noise
        self.skin_temp = (alpha_temp * self.skin_temp) + ((1.0 - alpha_temp) * target_temp) + temp_noise

        # Clamp to physiological viability limits
        self.hr = max(35.0, min(240.0, self.hr))
        self.spo2 = max(55.0, min(100.0, self.spo2))
        self.skin_temp = max(32.0, min(42.0, self.skin_temp))

        # 5. Closed-loop incubator physics (Dräger/GE servo thermal feedback)
        # Drive heater toward clinician's prescribed target skin temperature
        temp_err = self.target_skin_temp - self.skin_temp
        target_heater = max(0, min(100, int(50 + temp_err * 60)))
        self.heater_power = int(0.7 * self.heater_power + 0.3 * target_heater)

        # Oxygen flow tracks clinician actuator setting, with auto-servo boost during critical desat
        desat_deficit = max(0.0, 93.0 - self.spo2)
        effective_o2 = max(self.target_oxygen_flow, 2.0 + (desat_deficit * 0.45))
        self.oxygen_flow = round(0.7 * self.oxygen_flow + 0.3 * effective_o2, 1)

        # Fan speed modulation
        if self.skin_temp > 38.3:
            self.fan_speed = 1800  # High convection cooling
        elif self.heater_power > 65:
            self.fan_speed = 1500  # Warm air circulation
        else:
            self.fan_speed = 1200  # Nominal whisper quiet

        # Advance anomaly step counter
        if self.active_anomaly:
            self.anomaly_step += 1
            if self.anomaly_step >= self.anomaly_total_steps:
                self.active_anomaly = None
                self.anomaly_step = 0
                self.anomaly_total_steps = 0

        self.last_condition_label = condition

        readable_state = (
            f"ABD Cascade ({self.anomaly_step}/{self.anomaly_total_steps})" if self.active_anomaly == "bradycardia"
            else f"Anomaly:{self.active_anomaly.capitalize()}" if self.active_anomaly
            else self.behavior.replace("_", " ").title()
        )

        return {
            "device_id": self.device_id,
            "heart_rate": int(round(self.hr)),
            "spo2": round(self.spo2, 1),
            "temperature": round(self.skin_temp, 1),
            "heater_power": self.heater_power,
            "oxygen_flow": self.oxygen_flow,
            "fan_speed": self.fan_speed,
            "phototherapy": self.phototherapy,
            "anomaly_injected": is_anomaly,
            "condition": condition,
            "behavioral_state": readable_state,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }


# Global registry of live physiological twin states
DEVICE_PHYSIO_REGISTRY: dict = {}

def generate_vitals(device_id: str, patient_info: dict = None, forced_anomaly: str = None) -> dict:
    """Generate one simulated neonate vitals reading using the continuous physiological engine."""
    if device_id not in DEVICE_PHYSIO_REGISTRY:
        DEVICE_PHYSIO_REGISTRY[device_id] = NeonatePhysiology(device_id, patient_info)
    else:
        DEVICE_PHYSIO_REGISTRY[device_id].update_patient_info(patient_info)

    effective_anomaly = forced_anomaly or ACTIVE_ANOMALY.get(device_id) or ACTIVE_ANOMALY.get("__all__")
    return DEVICE_PHYSIO_REGISTRY[device_id].step(effective_anomaly)


def apply_actuator_control(device_id: str, payload: dict):
    """Processes an incoming clinician actuator command from the MQTT broker."""
    target_temp = payload.get("targetTemperature")
    oxygen_flow = payload.get("oxygenFlow")
    phototherapy = payload.get("phototherapy")
    clinician = payload.get("updatedBy", "Clinical Staff")

    print("\n" + "═" * 66)
    print(f"🎛️  [HARDWARE-IN-THE-LOOP CONTROL] Station: {device_id}")
    print(f"    Prescribed By:  {clinician}")
    if target_temp is not None:
        print(f"    Target Temp:    {target_temp}°C (Closed-loop servo active)")
    if oxygen_flow is not None:
        print(f"    Oxygen Flow:    {oxygen_flow} L/min (Direct pulmonary delivery)")
    if phototherapy is not None:
        print(f"    Phototherapy:   {'ACTIVE (Blue 450nm LED)' if phototherapy else 'STANDBY'}")
    print("═" * 66 + "\n")

    PENDING_CONTROLS[device_id] = payload
    if device_id in DEVICE_PHYSIO_REGISTRY:
        DEVICE_PHYSIO_REGISTRY[device_id].apply_control(target_temp, oxygen_flow, phototherapy)


# ---------------------------------------------------------------------------
# Backend Discovery — fetch occupied incubators from NeoCare API
# ---------------------------------------------------------------------------

def fetch_active_devices(backend_url: str, api_key: str) -> dict:
    """
    Returns dict:
      active_ids   -> set of deviceTopicIds with admitted patients
      patient_map  -> { deviceTopicId: patient_info_dict }
      all_ids      -> set of all registered deviceTopicIds
    """
    if not HAS_REQUESTS:
        return {"active_ids": set(), "patient_map": {}, "all_ids": set()}

    if not api_key:
        print("[api] SIMULATOR_API_KEY is not set - cannot authenticate to backend. See simulator/.env.example.")
        return {"active_ids": set(), "patient_map": {}, "all_ids": set()}

    try:
        headers = {"X-Simulator-Key": api_key}
        resp = _requests.get(
            f"{backend_url}/api/incubators/active-simulation-devices",
            headers=headers,
            timeout=8,
        )
        if resp.status_code != 200:
            print(f"[api] Warning: active-simulation-devices returned {resp.status_code} - {resp.text[:200]}")
            return {"active_ids": set(), "patient_map": {}, "all_ids": set()}

        data = resp.json()
        active_sims  = data.get("activeSimulations", [])
        all_incubs   = data.get("allIncubators", [])

        # Cache initial actuator setpoints from database
        for s in active_sims:
            dev_topic = s.get("deviceTopicId")
            ctrl = s.get("controlSettings")
            if dev_topic and ctrl:
                PENDING_CONTROLS[dev_topic] = ctrl

        active_ids  = {s["deviceTopicId"] for s in active_sims}
        patient_map = {s["deviceTopicId"]: s["patient"] for s in active_sims}
        all_ids     = {i["deviceTopicId"] for i in all_incubs if i.get("deviceTopicId")}

        return {"active_ids": active_ids, "patient_map": patient_map, "all_ids": all_ids}

    except Exception as e:
        print(f"[api] Could not reach backend: {e}")
        return {"active_ids": set(), "patient_map": {}, "all_ids": set()}


# ---------------------------------------------------------------------------
# Interactive anomaly menu (runs in background thread)
# ---------------------------------------------------------------------------

def interactive_menu(get_devices_fn):
    print("\n" + "=" * 58)
    print("  INTERACTIVE ANOMALY CONTROLLER")
    print("=" * 58)
    print("Keys apply to ALL occupied (active-patient) devices:")
    for key, (_, desc) in ANOMALY_TYPES.items():
        print(f"  [{key}] {desc}")
    print("=" * 58 + "\n")

    while True:
        try:
            choice = input("Select condition [0-5]: ").strip()
            if choice in ANOMALY_TYPES:
                anomaly_type, desc = ANOMALY_TYPES[choice]
                for dev in get_devices_fn():
                    ACTIVE_ANOMALY[dev] = anomaly_type
                print(f"\n>>> APPLIED TO ALL OCCUPIED DEVICES: {desc}\n")
            else:
                print("Invalid key. Choose 0-5.")
        except (EOFError, KeyboardInterrupt):
            break


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="NeoCare Patient-Aware Sensor Simulator")
    parser.add_argument("--devices",      type=str,  default="",
                        help="Comma-separated device IDs to FORCE (bypasses API discovery — for offline testing)")
    parser.add_argument("--interval",     type=int,  default=3,
                        help="Publish interval in seconds (default: 3)")
    parser.add_argument("--refresh",      type=int,  default=15,
                        help="How often (seconds) to re-query the backend for patient admissions (default: 15)")
    parser.add_argument("--anomaly",      type=str,
                        choices=["bradycardia", "tachycardia", "hypoxia", "hyperthermia", "hypothermia"],
                        help="Force anomaly type across all active devices")
    parser.add_argument("--interactive",  action="store_true",
                        help="Enable interactive keyboard anomaly control")
    parser.add_argument("--offline",      action="store_true",
                        help="Skip API discovery (use --devices list only)")
    args = parser.parse_args()

    # Forced device list (offline / legacy mode)
    forced_devices = [d.strip() for d in args.devices.split(",") if d.strip()]

    if args.anomaly:
        for d in (forced_devices or ["__all__"]):
            ACTIVE_ANOMALY[d] = args.anomaly

    if "REPLACE_WITH" in BROKER_HOST or "REPLACE_WITH" in USERNAME or "REPLACE_WITH" in PASSWORD:
        print("[setup required] Missing HiveMQ credentials in .env or environment variables.")
        sys.exit(1)

    print(f"[config] HiveMQ Host:    {BROKER_HOST}:{BROKER_PORT}")
    print(f"[config] Backend URL:    {BACKEND_URL}")
    if not SIMULATOR_API_KEY and not forced_devices and not args.offline:
        print("[warn] SIMULATOR_API_KEY is not set - patient-discovery calls will fail and")
        print("[warn] NO vitals will be published for any device until this is fixed.")
        print("[warn] Set it in simulator/.env, matching backend/.env's SIMULATOR_API_KEY exactly.\n")
    print(f"[config] Publish every:  {args.interval}s")
    print(f"[config] Refresh every:  {args.refresh}s")
    if forced_devices:
        print(f"[config] FORCED devices: {', '.join(forced_devices)} (API discovery disabled)")
    print()

    # MQTT setup
    client = mqtt.Client(
        callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        client_id=f"neocare-sim-{int(time.time())}",
    )
    client.username_pw_set(USERNAME, PASSWORD)
    client.tls_set(tls_version=ssl.PROTOCOL_TLS_CLIENT)

    connected_evt = threading.Event()

    def on_connect(c, userdata, flags, rc, props=None):
        if rc == 0:
            print("[connected] MQTT broker connected successfully.")
            # Subscribe to Hardware-in-the-Loop actuator commands from clinicians
            c.subscribe("neocare/+/control", qos=1)
            print("[subscribed] Listening on 'neocare/+/control' for clinician actuation.\n")
            connected_evt.set()
        else:
            print(f"[error] MQTT Connection failed with code {rc}")

    def on_message(c, userdata, msg):
        try:
            topic = msg.topic
            payload = json.loads(msg.payload.decode("utf-8"))
            if topic.endswith("/control"):
                parts = topic.split("/")
                if len(parts) >= 3:
                    dev_id = parts[1]
                    apply_actuator_control(dev_id, payload)
        except Exception as err:
            print(f"[warn] Could not process control message: {err}")

    client.on_connect = on_connect
    client.on_message = on_message

    try:
        client.connect(BROKER_HOST, BROKER_PORT, keepalive=60)
    except Exception as err:
        print(f"[fatal] Could not connect to HiveMQ: {err}")
        sys.exit(1)

    client.loop_start()
    if not connected_evt.wait(timeout=10):
        print("[error] Timeout waiting for MQTT broker connection.")
        client.loop_stop()
        sys.exit(1)

    # State shared across loop
    state = {
        "active_ids":  set(forced_devices),
        "patient_map": {},
        "all_ids":     set(forced_devices),
        "last_refresh": 0,
    }

    if args.interactive:
        menu_thread = threading.Thread(
            target=interactive_menu,
            args=(lambda: list(state["active_ids"]),),
            daemon=True,
        )
        menu_thread.start()

    print("[publishing] Simulator running. Press Ctrl+C to stop.\n")

    tick = 0
    try:
        while True:
            now = time.time()

            # Re-query the backend on first boot and periodically
            if not args.offline and not forced_devices:
                if now - state["last_refresh"] >= args.refresh:
                    result = fetch_active_devices(BACKEND_URL, SIMULATOR_API_KEY)
                    state["active_ids"]  = result["active_ids"]
                    state["patient_map"] = result["patient_map"]
                    state["all_ids"]     = result["all_ids"]
                    state["last_refresh"] = now

                    if state["active_ids"]:
                        print(f"\n[discovery] Occupied beds: {', '.join(sorted(state['active_ids']))}")
                    else:
                        print(f"\n[discovery] No occupied beds found. All incubators are in Standby.")

                    standby = state["all_ids"] - state["active_ids"]
                    if standby:
                        print(f"[discovery] Standby (empty) beds: {', '.join(sorted(standby))}\n")

            # --- Publish cycle ---
            all_to_process = state["active_ids"] | (state["all_ids"] - state["active_ids"])

            for dev in sorted(all_to_process):
                if dev in state["active_ids"]:
                    # Occupied bed — generate real neonate vitals
                    patient = state["patient_map"].get(dev, {})
                    forced = ACTIVE_ANOMALY.get(dev) or ACTIVE_ANOMALY.get("__all__")
                    reading = generate_vitals(dev, patient, forced)
                    topic = f"neocare/{dev}/vitals"
                    client.publish(topic, json.dumps(reading), qos=1)

                    patient_label = patient.get("name", "Unknown Patient") if patient else "Unknown"
                    syndrome_str = patient.get("primarySyndrome", "Observation") if patient else "Observation"
                    beh_str = reading.get("behavioral_state", "Normal")
                    tag = f" [{reading['condition'].upper()}]" if reading["anomaly_injected"] else ""

                    print(
                        f"[{dev}] 👶 {patient_label:.<18} ({syndrome_str:.<20}) [{beh_str:.<18}] "
                        f"HR={reading['heart_rate']:>3} bpm | "
                        f"SpO2={reading['spo2']:>5.1f}% | "
                        f"Temp={reading['temperature']:>4.1f}°C{tag}"
                    )
                else:
                    # Clear physiological instance if device was vacated
                    DEVICE_PHYSIO_REGISTRY.pop(dev, None)

                    # Empty / standby bed — publish standby status, NO infant vitals
                    standby_payload = json.dumps({
                        "device_id": dev,
                        "status":    "standby",
                        "reason":    "No patient admitted",
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })
                    client.publish(f"neocare/{dev}/status", standby_payload, retain=True)
                    # Only print standby message every 5 ticks to avoid log spam
                    if tick % 5 == 0:
                        print(f"[{dev}] 🟢 STANDBY — Bed empty (admit a patient in Web Dashboard to start telemetry)")

            tick += 1
            time.sleep(args.interval)

    except KeyboardInterrupt:
        print("\n[shutting down] Stopping simulator...")
    finally:
        for dev in (state["active_ids"] | state["all_ids"] | set(forced_devices)):
            client.publish(
                f"neocare/{dev}/status",
                json.dumps({"device_id": dev, "status": "offline"}),
                retain=True,
            )
        DEVICE_PHYSIO_REGISTRY.clear()
        client.loop_stop()
        client.disconnect()
        print("[stopped] Simulator cleanly disconnected.")


if __name__ == "__main__":
    main()