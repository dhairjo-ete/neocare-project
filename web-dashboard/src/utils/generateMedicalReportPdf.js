import { jsPDF } from "jspdf";

/* ==========================================================================
   NeoCare NICU Clinical Monitoring Report (PDF)
   --------------------------------------------------------------------------
   Design principles
   1. Never print invented clinical facts. Missing data is shown as "Not recorded".
   2. Never print per-second raw data. Telemetry is summarised into
      adaptive time intervals (min / mean / max), trend charts and an
      excursion (event) log, which is how clinical monitoring reports work.
   3. Abnormal values are flagged with H / L letters, so the report stays
      readable in black-and-white print, not only by colour.
   4. Automated statements describe data only. Diagnosis is left to the
      clinician.
   ========================================================================== */

// Reference ranges. Override through the `referenceRanges` argument if the
// unit protocol differs (e.g. different gestational-age targets).
const DEFAULT_RANGES = {
  heart_rate: {
    short: "HR", label: "Heart Rate", unit: "bpm", decimals: 0,
    low: 100, high: 160, criticalLow: 80, criticalHigh: 180,
  },
  spo2: {
    short: "SpO2", label: "Oxygen Saturation (SpO2)", unit: "%", decimals: 0,
    low: 90, high: 100, criticalLow: 85, criticalHigh: null,
  },
  temperature: {
    short: "Temp", label: "Incubator / Skin Temperature", unit: "°C", decimals: 1,
    low: 36.5, high: 37.5, criticalLow: 36.0, criticalHigh: 38.0,
  },
};
const KEYS = ["heart_rate", "spo2", "temperature"];

/* ------------------------------- formatting ------------------------------ */

function toDate(d) {
  if (!d) return null;
  const date = new Date(d);
  return isNaN(date.getTime()) ? null : date;
}
function formatDateTime(d) {
  const date = toDate(d);
  if (!date) return d ? String(d) : "Not recorded";
  return date.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}
function formatDateOnly(d) {
  const date = toDate(d);
  if (!date) return d ? String(d) : "Not recorded";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function formatClock(ms) {
  return new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
}
function formatShortStamp(ms) {
  return new Date(ms).toLocaleString("en-GB", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  });
}
function formatDuration(ms) {
  if (!isFinite(ms) || ms < 0) return "-";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${String(m % 60).padStart(2, "0")}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
function formatInterval(ms) {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} min`;
  if (m < 1440) return `${m / 60} h`;
  return `${m / 1440} day`;
}
function fmtNum(v, decimals) {
  return v == null || !isFinite(v) ? "-" : Number(v).toFixed(decimals);
}
function formatDoctorName(name) {
  if (!name) return null;
  const t = String(name).trim();
  return /^dr\.?\s+/i.test(t) ? t : `Dr. ${t}`;
}
function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// Small non-cryptographic hash, used only as a document consistency code.
function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).toUpperCase().padStart(14, "0");
}

/* ----------------------- derived, evidence-based fields ------------------ */

function gestationCategory(weeks) {
  const w = Number(weeks);
  if (!isFinite(w) || w <= 0) return null;
  if (w < 28) return "Extremely preterm";
  if (w < 32) return "Very preterm";
  if (w < 37) return "Moderate to late preterm";
  return "Term";
}
function weightCategory(grams) {
  const g = Number(grams);
  if (!isFinite(g) || g <= 0) return null;
  if (g < 1000) return "Extremely low birth weight";
  if (g < 1500) return "Very low birth weight";
  if (g < 2500) return "Low birth weight";
  return "Normal birth weight";
}
function ageOfLife(dob, until) {
  const b = toDate(dob);
  const e = toDate(until) || new Date();
  if (!b || e < b) return null;
  const hours = Math.floor((e - b) / 3600000);
  if (hours < 72) return `${hours} hours`;
  return `${Math.floor(hours / 24)} days`;
}

/* ------------------------------ data analysis ---------------------------- */

function num(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

function flagOf(cfg, v) {
  if (v == null) return "";
  if (cfg.low != null && v < cfg.low) return "L";
  if (cfg.high != null && v > cfg.high) return "H";
  return "";
}
function isCritical(cfg, v) {
  if (v == null) return false;
  return (cfg.criticalLow != null && v < cfg.criticalLow) ||
    (cfg.criticalHigh != null && v > cfg.criticalHigh);
}

function normaliseReadings(history) {
  return (history || [])
    .map((r) => {
      const d = toDate(r.timestamp);
      return d
        ? { t: d.getTime(), heart_rate: num(r.heart_rate), spo2: num(r.spo2), temperature: num(r.temperature) }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.t - b.t);
}

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function computeStats(rows, ranges) {
  const out = {};
  KEYS.forEach((k) => {
    const cfg = ranges[k];
    const vals = rows.map((r) => r[k]).filter((v) => v != null);
    const n = vals.length;
    const below = vals.filter((v) => v < cfg.low).length;
    const above = vals.filter((v) => cfg.high != null && v > cfg.high).length;
    out[k] = {
      n,
      min: n ? Math.min(...vals) : null,
      max: n ? Math.max(...vals) : null,
      mean: n ? vals.reduce((a, b) => a + b, 0) / n : null,
      latest: n ? vals[n - 1] : null,
      below,
      above,
      inRangePct: n ? ((n - below - above) / n) * 100 : null,
    };
  });
  return out;
}

// Picks the smallest "round" interval that keeps the table to <= maxRows rows.
function chooseBucketMs(spanMs, maxRows = 48) {
  const options = [1, 5, 10, 15, 30, 60, 120, 240, 360, 720, 1440].map((m) => m * 60000);
  for (const o of options) if (spanMs / o <= maxRows) return o;
  return options[options.length - 1];
}

function buildBuckets(rows, bucketMs) {
  if (!rows.length) return [];
  const map = new Map();
  rows.forEach((r) => {
    const start = Math.floor(r.t / bucketMs) * bucketMs;
    if (!map.has(start)) {
      const b = { start, end: start + bucketMs, n: 0 };
      KEYS.forEach((k) => (b[k] = { min: Infinity, max: -Infinity, sum: 0, n: 0 }));
      map.set(start, b);
    }
    const b = map.get(start);
    b.n++;
    KEYS.forEach((k) => {
      const v = r[k];
      if (v == null) return;
      const s = b[k];
      s.min = Math.min(s.min, v);
      s.max = Math.max(s.max, v);
      s.sum += v;
      s.n++;
    });
  });
  return [...map.values()].sort((a, b) => a.start - b.start);
}

// Consecutive out-of-range readings of one parameter and direction = one episode.
function detectEpisodes(rows, ranges, intervalMs) {
  const episodes = [];
  KEYS.forEach((k) => {
    const cfg = ranges[k];
    let cur = null;
    const close = () => {
      if (cur) {
        cur.durationMs = Math.max(cur.endT - cur.startT + intervalMs, intervalMs);
        episodes.push(cur);
        cur = null;
      }
    };
    rows.forEach((r) => {
      const v = r[k];
      const f = flagOf(cfg, v);
      if (!f) return close();
      if (cur && cur.flag !== f) close();
      if (!cur) cur = { key: k, flag: f, startT: r.t, endT: r.t, peak: v, count: 0, critical: false };
      cur.endT = r.t;
      cur.count++;
      cur.peak = f === "L" ? Math.min(cur.peak, v) : Math.max(cur.peak, v);
      if (isCritical(cfg, v)) cur.critical = true;
    });
    close();
  });
  return episodes.sort((a, b) => a.startT - b.startT);
}

/* ------------------------------- main export ----------------------------- */

/**
 * @param {Object}  opts.patient         populated patient document
 * @param {Array}   opts.notes           clinical notes
 * @param {Object}  opts.vitalsStats     server aggregate ({summary, latest}); used only if no readings are supplied
 * @param {Array}   opts.vitalsHistory   telemetry readings (any sampling rate)
 * @param {Object}  opts.referenceRanges optional overrides of DEFAULT_RANGES
 * @param {boolean} opts.save            set false to only return the jsPDF instance
 */
export function generateMedicalReportPdf({
  patient,
  notes = [],
  vitalsStats = {},
  vitalsHistory = [],
  referenceRanges = {},
  save = true,
}) {
  if (!patient) return null;

  const ranges = {};
  KEYS.forEach((k) => (ranges[k] = { ...DEFAULT_RANGES[k], ...(referenceRanges[k] || {}) }));

  /* ---------- analysis ---------- */
  const rows = normaliseReadings(vitalsHistory);
  const stats = computeStats(rows, ranges);
  const sum = vitalsStats.summary || {};
  const lat = vitalsStats.latest || {};
  if (!rows.length) {
    // Fall back to server aggregates, without percentages we cannot know.
    const map = {
      heart_rate: [sum.minHR, sum.avgHR, sum.maxHR],
      spo2: [sum.minSpO2, sum.avgSpO2, sum.maxSpO2],
      temperature: [sum.minTemp, sum.avgTemp, sum.maxTemp],
    };
    KEYS.forEach((k) => {
      stats[k] = {
        n: 0, min: num(map[k][0]), mean: num(map[k][1]), max: num(map[k][2]),
        latest: num(lat[k]), below: 0, above: 0, inRangePct: null,
      };
    });
  }

  const firstT = rows.length ? rows[0].t : null;
  const lastT = rows.length ? rows[rows.length - 1].t : null;
  const spanMs = rows.length ? lastT - firstT : 0;
  const diffs = [];
  for (let i = 1; i < rows.length; i++) {
    const d = rows[i].t - rows[i - 1].t;
    if (d > 0) diffs.push(d);
  }
  const intervalMs = median(diffs) || 0;
  const gaps = intervalMs ? diffs.filter((d) => d > intervalMs * 3) : [];
  const longestGapMs = gaps.length ? Math.max(...gaps) : 0;
  const bucketMs = chooseBucketMs(Math.max(spanMs, 60000));
  const buckets = buildBuckets(rows, bucketMs);
  const episodes = detectEpisodes(rows, ranges, intervalMs || 1000);
  const criticalCount = episodes.filter((e) => e.critical).length;

  /* ---------- identity ---------- */
  const isDischarged = Boolean(patient.dischargedAt);
  const doctor = patient.assignedDoctor;
  const nurse = patient.assignedNurse;
  const doctorName = formatDoctorName(doctor?.name);
  const mrn = `MRN-${String(patient._id || "").slice(-8).toUpperCase() || "UNKNOWN"}`;
  const reportRef = `NC-NICU-${new Date().getFullYear()}-${String(patient._id || "").slice(-6).toUpperCase() || "000000"}`;
  const generatedAt = formatDateTime(new Date());
  const hospitalName = (patient.hospitalId?.name || "Central Hospital NICU").toUpperCase();
  const hospitalAddress = patient.hospitalId?.address || "";
  const systemName = "NeoCare Neonatal Telemetry";
  const bedLabel = patient.incubatorId?.label || patient.incubatorId?.deviceTopicId || "Not assigned";
  const integrityCode = cyrb53(
    [patient._id, reportRef, rows.length, firstT, lastT,
      ...KEYS.map((k) => `${stats[k].min}|${stats[k].mean}|${stats[k].max}`)].join("~")
  );

  /* ---------- document + palette ---------- */
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - margin * 2;
  const limitY = pageHeight - 38; // footer zone starts below this

  const blue = [24, 70, 150];
  const blueLight = [222, 234, 250];
  const magenta = [168, 32, 104];
  const navy = [18, 45, 100];
  const red = [200, 20, 40];
  const amber = [180, 83, 9];
  const cyan = [2, 110, 170];
  const green = [21, 128, 61];
  const ink = [20, 20, 30];
  const body = [60, 60, 70];
  const muted = [110, 110, 120];
  const line = [190, 196, 205];
  const lineSoft = [225, 229, 235];
  const chartColor = { heart_rate: [190, 18, 60], spo2: cyan, temperature: amber };

  let y = 12;

  const text = (s, x, yy, opts) => doc.text(Array.isArray(s) ? s.map(String) : String(s), x, yy, opts);
  const setFont = (style, size, color) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };
  const lighten = (c, f = 0.65) => c.map((v) => Math.round(v + (255 - v) * f));
  const hline = (yy, color = line, w = 0.2, x1 = margin, x2 = pageWidth - margin) => {
    doc.setDrawColor(...color);
    doc.setLineWidth(w);
    doc.line(x1, yy, x2, yy);
  };

  /* ---------- Code 39 barcode (decorative, encodes the MRN) ---------- */
  const C39 = {
    "0": "nnnwwnwnn", "1": "wnnwnnnnw", "2": "nnwwnnnnw", "3": "wnwwnnnnn", "4": "nnnwwnnnw",
    "5": "wnnwwnnnn", "6": "nnwwwnnnn", "7": "nnnwnnwnw", "8": "wnnwnnwnn", "9": "nnwwnnwnn",
    A: "wnnnnwnnw", B: "nnwnnwnnw", C: "wnwnnwnnn", D: "nnnnwwnnw", E: "wnnnwwnnn",
    F: "nnwnwwnnn", G: "nnnnnwwnw", H: "wnnnnwwnn", I: "nnwnnwwnn", J: "nnnnwwwnn",
    K: "wnnnnnnww", L: "nnwnnnnww", M: "wnwnnnnwn", N: "nnnnwnnww", O: "wnnnwnnwn",
    P: "nnwnwnnwn", Q: "nnnnnnwww", R: "wnnnnnwwn", S: "nnwnnnwwn", T: "nnnnwnwwn",
    U: "wwnnnnnnw", V: "nwwnnnnnw", W: "wwwnnnnnn", X: "nwnnwnnnw", Y: "wwnnwnnnn",
    Z: "nwwnwnnnn", "-": "nwnnnnwnw", ".": "wwnnnnwnn", " ": "nwwnnnwnn", "*": "nwnnwnwnn",
  };
  function drawCode39(value, x, yy, h) {
    const narrow = 0.2, wide = 0.5;
    const s = `*${String(value).toUpperCase().replace(/[^0-9A-Z\-. ]/g, "-")}*`;
    let cx = x;
    doc.setFillColor(0, 0, 0);
    for (const ch of s) {
      const pat = C39[ch];
      for (let i = 0; i < 9; i++) {
        const w = pat[i] === "w" ? wide : narrow;
        if (i % 2 === 0) doc.rect(cx, yy, w, h, "F");
        cx += w;
      }
      cx += narrow;
    }
    return cx - x;
  }

  /* ---------- page furniture ---------- */
  function drawRunningHeader() {
    setFont("bold", 8.5, magenta);
    text("NICU MONITORING REPORT", margin, 15);
    setFont("normal", 7, muted);
    const rightHdr = `${hospitalName}  •  ${systemName}  |  ${patient.name || "Infant"}  |  ${mrn}`;
    text(doc.splitTextToSize(rightHdr, 135)[0], pageWidth - margin, 15, { align: "right" });
    hline(18, blue, 0.5);
    return 24;
  }
  function newPage() {
    doc.addPage();
    y = drawRunningHeader();
  }
  function ensure(h) {
    if (y + h > limitY) newPage();
  }
  // Light-blue section band, like the "Biochemistry" band of a lab report
  function band(title, minSpace = 24) {
    ensure(minSpace);
    doc.setFillColor(...blueLight);
    doc.rect(margin, y, contentWidth, 6.5, "F");
    hline(y, blue, 0.4);
    hline(y + 6.5, blue, 0.4);
    setFont("bolditalic", 9.5, blue);
    text(title, pageWidth / 2, y + 4.5, { align: "center" });
    y += 6.5;
  }
  function tableHeader(cols, h = 6.5, sub = null) {
    hline(y, blue, 0.4);
    setFont("bolditalic", 7.5, ink);
    cols.forEach((c) => text(c.t, margin + c.x, y + 4.3, c.align ? { align: c.align } : undefined));
    if (sub) {
      setFont("normal", 6, muted);
      sub.forEach((c) => text(c.t, margin + c.x, y + 7.6));
    }
    hline(y + h, blue, 0.4);
    y += h + 1.5;
  }
  function paragraph(str, size = 8, color = body, width = contentWidth) {
    setFont("normal", size, color);
    const lines = doc.splitTextToSize(str, width);
    const h = lines.length * (size * 0.43) + 1.5;
    ensure(h);
    text(lines, margin, y + size * 0.36);
    y += h;
  }
  // Plain "Label : value" two-column grid
  function kvGrid(items) {
    const colW = contentWidth / 2;
    const lw = 36;
    const vw = colW - lw - 4;
    items.forEach((r) => {
      setFont("normal", 8, ink);
      const a = doc.splitTextToSize(String(r[1] ?? "Not recorded"), vw);
      const b = r[2] ? doc.splitTextToSize(String(r[3] ?? "Not recorded"), vw) : [""];
      const h = Math.max(a.length, b.length) * 3.6 + 1.8;
      ensure(h);
      setFont("normal", 8, muted);
      text(r[0], margin + 2, y + 3.6);
      text(":", margin + lw - 3, y + 3.6);
      if (r[2]) {
        text(r[2], margin + colW + 2, y + 3.6);
        text(":", margin + colW + lw - 3, y + 3.6);
      }
      setFont("normal", 8, ink);
      text(a, margin + lw, y + 3.6);
      if (r[2]) text(b, margin + colW + lw, y + 3.6);
      y += h;
    });
    y += 2;
  }

  /* ======================================================================
     PAGE 1 HEADER: title left, hospital logotype right, patient block
     ====================================================================== */
  setFont("normal", 16, magenta);
  text("NICU MONITORING REPORT", margin, y + 8);
  setFont("normal", 7.5, muted);
  text("Neonatal vital-signs telemetry", margin, y + 12.5);

  let fs = 15;
  setFont("bold", fs, blue);
  while (doc.getTextWidth(hospitalName) > 92 && fs > 9) {
    fs -= 0.5;
    doc.setFontSize(fs);
  }
  const nameW = doc.getTextWidth(hospitalName);
  text(hospitalName, pageWidth - margin, y + 7.5, { align: "right" });
  // emblem
  const ex = pageWidth - margin - nameW - 11;
  doc.setFillColor(...red);
  doc.roundedRect(ex, y + 1, 8, 8, 1.2, 1.2, "F");
  doc.setFillColor(255, 255, 255);
  doc.rect(ex + 3.2, y + 2.3, 1.6, 5.4, "F");
  doc.rect(ex + 1.3, y + 4.2, 5.4, 1.6, "F");

  // System name immediately after hospital name
  setFont("bold", 8.5, magenta);
  text(systemName, pageWidth - margin, y + 12.5, { align: "right" });

  setFont("italic", 7, muted);
  const deptAndAddress = hospitalAddress
    ? `Neonatal Intensive Care Unit  |  ${hospitalAddress}`
    : "Neonatal Intensive Care Unit";
  text(doc.splitTextToSize(deptAndAddress, 95)[0], pageWidth - margin, y + 16.5, { align: "right" });
  y += 24;

  // Left info + right label/value block
  const blockTop = y;
  setFont("bold", 10, ink);
  text("Vital Signs Telemetry", margin, blockTop + 8);
  setFont("italic", 8, body);
  text("HR, SpO2, INCUBATOR TEMP", margin, blockTop + 12.5);
  setFont("normal", 7.8, body);
  const leftInfo = [
    `Hospital: ${hospitalName}`,
    `System: ${systemName}`,
    `Ward: ${patient.wardId?.name || "Not recorded"}`,
    `Bed: ${bedLabel}`,
    `Attending: ${doctorName || "Not assigned"}`,
    `Status: ${isDischarged ? "Discharged" : "Currently admitted"}`,
  ];
  leftInfo.forEach((s, i) => text(doc.splitTextToSize(s, 80)[0], margin, blockTop + 18 + i * 4.2));

  const ageStr = ageOfLife(patient.dateOfBirth, patient.dischargedAt) || "-";
  const rightRows = [
    ["Patient Name", patient.name || "Not recorded"],
    ["MRN / Access Code", `${mrn} / ${patient.accessCode || "-"}`],
    ["Gender / Age", `${cap(patient.biologicalSex) || "-"} / ${ageStr}`],
    ["Gestation / Birth Wt", `${patient.gestationalAgeWeeks ? patient.gestationalAgeWeeks + " wks" : "-"} / ${patient.birthWeightGrams ? patient.birthWeightGrams + " g" : "-"}`],
    ["Date Admitted", formatDateTime(patient.admittedAt)],
    ["Monitoring From", rows.length ? formatDateTime(firstT) : "No telemetry"],
    ["Monitoring To", rows.length ? formatDateTime(lastT) : "No telemetry"],
    ["Date Reported", generatedAt],
    ["Report No.", reportRef],
  ];
  const lx = 104, cx = 137, vx = 140;
  rightRows.forEach((r, i) => {
    const yy = blockTop + 3 + i * 4.7;
    setFont("normal", 8, ink);
    text(r[0], lx, yy);
    text(":", cx, yy);
    setFont("bold", 8, ink);
    const v = doc.splitTextToSize(String(r[1]), pageWidth - margin - vx);
    text(v.length > 1 ? v[0].replace(/.{1}$/, "…") : v[0], vx, yy);
  });
  y = blockTop + 3 + rightRows.length * 4.7 + 2;

  setFont("italic", 7.2, body);
  const specimen = "Specimen : Continuous bedside telemetry from incubator sensors. Values are device readings, not laboratory assays.";
  text(doc.splitTextToSize(specimen, contentWidth)[0], margin, y + 3);
  hline(y + 5, blue, 0.3);
  y += 8;

  /* ======================================================================
     RESULTS: lab style table
     ====================================================================== */
  band("Vital Signs Telemetry Summary", 60);
  const rc = { item: 3, res: 86, unit: 89, flag: 111, ref: 124 };
  tableHeader([
    { t: "Test Item(s)", x: rc.item },
    { t: "Result(s)", x: rc.res, align: "right" },
    { t: "Unit(s)", x: rc.unit },
    { t: "Flag", x: rc.flag },
    { t: "Ref. Range", x: rc.ref },
  ]);

  function critText(c) {
    const p = [];
    if (c.criticalLow != null) p.push(`< ${c.criticalLow}`);
    if (c.criticalHigh != null) p.push(`> ${c.criticalHigh}`);
    return p.length ? `Critical: ${p.join(" or ")} ${c.unit}` : "";
  }

  function paramGroup(k) {
    const c = ranges[k], s = stats[k];
    ensure(46);
    setFont("bold", 8.5, ink);
    const title = c.label;
    text(title, margin + 1, y + 3.6);
    hline(y + 4.4, ink, 0.25, margin + 1, margin + 1 + doc.getTextWidth(title));
    y += 7;

    const defs = [
      ["Latest reading", s.latest],
      ["Mean (average)", s.mean],
      ["Minimum", s.min],
      ["Maximum", s.max],
    ];
    defs.forEach(([label, v], i) => {
      const f = flagOf(c, v);
      const rowH = i === 0 ? 10 : 5.2;
      setFont("normal", 8.5, ink);
      text(label, margin + rc.item + 2, y + 3.6);
      setFont("bold", 9, f ? red : ink);
      text(fmtNum(v, c.decimals), margin + rc.res, y + 3.6, { align: "right" });
      setFont("normal", 8, ink);
      text(c.unit, margin + rc.unit, y + 3.6);
      if (f) {
        setFont("bold", 8.5, red);
        text(f, margin + rc.flag, y + 3.6);
      }
      if (i === 0) {
        setFont("normal", 8, ink);
        text(`${c.low} - ${c.high}`, margin + rc.ref, y + 3.6);
        setFont("normal", 6.3, muted);
        text("Unit default range; individual targets may differ", margin + rc.ref, y + 6.6);
        if (critText(c)) text(critText(c), margin + rc.ref, y + 9.2);
      }
      y += rowH;
    });

    // within range + counts
    setFont("normal", 8.5, ink);
    text("Readings within range", margin + rc.item + 2, y + 3.6);
    setFont("bold", 9, ink);
    text(s.inRangePct == null ? "-" : s.inRangePct.toFixed(1), margin + rc.res, y + 3.6, { align: "right" });
    setFont("normal", 8, ink);
    text("%", margin + rc.unit, y + 3.6);
    y += 5.2;
    const oor = s.below + s.above > 0;
    setFont("normal", 8.5, ink);
    text("Readings below / above range", margin + rc.item + 2, y + 3.6);
    setFont("bold", 9, oor ? red : ink);
    text(s.n ? `${s.below} / ${s.above}` : "-", margin + rc.res, y + 3.6, { align: "right" });
    setFont("normal", 8, ink);
    text("readings", margin + rc.unit, y + 3.6);
    if (oor) {
      setFont("bold", 8.5, red);
      text(s.below && s.above ? "L / H" : s.below ? "L" : "H", margin + rc.flag, y + 3.6);
    }
    y += 8;
  }
  KEYS.forEach(paramGroup);

  setFont("normal", 6.5, muted);
  ensure(10);
  text(
    doc.splitTextToSize("L = below reference range, H = above reference range. Flagged values are shown in red.", contentWidth),
    margin, y + 2
  );
  y += 7;

  // Monitoring summary + automated findings
  band("Monitoring Summary", 26);
  y += 2;
  kvGrid([
    ["Data window", rows.length ? `${formatShortStamp(firstT)} to ${formatShortStamp(lastT)}` : "No telemetry supplied",
      "Duration", rows.length ? formatDuration(spanMs) : "-"],
    ["Readings analysed", String(rows.length), "Sampling interval", intervalMs ? formatDuration(intervalMs) : "-"],
    ["Telemetry gaps", rows.length ? `${gaps.length}${gaps.length ? ` (longest ${formatDuration(longestGapMs)})` : ""}` : "-",
      "Out-of-range episodes", rows.length ? `${episodes.length} (${criticalCount} critical)` : "-"],
  ]);
  if (rows.length) {
    const parts = KEYS.map((k) => {
      const s = stats[k], c = ranges[k];
      if (!s.n) return `${c.short}: no data.`;
      return `${c.short} within ${c.low}-${c.high} ${c.unit} for ${s.inRangePct.toFixed(1)}% of readings ` +
        `(mean ${fmtNum(s.mean, c.decimals)}, range ${fmtNum(s.min, c.decimals)}-${fmtNum(s.max, c.decimals)} ${c.unit}).`;
    });
    const headline = criticalCount
      ? `${criticalCount} critical-threshold episode(s) require clinician review (see the out-of-range episode log).`
      : episodes.length
        ? `${episodes.length} out-of-range episode(s) recorded, none beyond critical thresholds.`
        : "No out-of-range episodes recorded in the data window.";
    ensure(8);
    setFont("bold", 8, ink);
    text("Automated data findings", margin + 2, y + 3);
    y += 5;
    paragraph(`${parts.join("  ")}  ${headline}`, 8, body);
    paragraph(
      "Automated findings describe measured values against reference ranges only. They are not a diagnosis and must be reviewed by a qualified clinician.",
      7, muted
    );
  }
  y += 2;

  /* ======================================================================
     TREND CHARTS
     ====================================================================== */
  band("Vital Sign Trends", 58);
  y += 2;
  paragraph(
    rows.length
      ? `Each point is the mean of a ${formatInterval(bucketMs)} interval. Vertical bars show the min-max range within the interval. Shaded band = reference range. Red dots = interval with out-of-range values.`
      : "No telemetry readings were supplied, so trend charts cannot be drawn.",
    7, muted
  );

  function drawTrendChart(k) {
    const c = ranges[k];
    const color = chartColor[k];
    const H = 38;
    ensure(H);
    const x0 = margin + 13;
    const w = contentWidth - 15;
    const top = y + 7;
    const ph = 24;
    const bottom = top + ph;

    setFont("bold", 8, color);
    text(`${c.label} (${c.unit})`, margin, y + 4);

    const pts = buckets.filter((b) => b[k].n > 0);
    doc.setDrawColor(...line);
    doc.setLineWidth(0.3);
    if (!pts.length) {
      doc.rect(x0, top, w, ph);
      setFont("italic", 7.5, muted);
      text("No data", x0 + w / 2, top + ph / 2, { align: "center" });
      y += H;
      return;
    }
    let vmin = Math.min(...pts.map((b) => b[k].min), c.low);
    let vmax = Math.max(...pts.map((b) => b[k].max), c.high);
    const pad = (vmax - vmin) * 0.1 || 1;
    vmin -= pad;
    vmax += pad;
    const tmin = pts[0].start + bucketMs / 2;
    const tmax = pts[pts.length - 1].start + bucketMs / 2;
    const mapY = (v) => bottom - ((v - vmin) / (vmax - vmin)) * ph;
    const mapX = (t) => (tmax === tmin ? x0 + w / 2 : x0 + ((t - tmin) / (tmax - tmin)) * (w - 4) + 2);

    const bandTop = mapY(Math.min(c.high, vmax));
    const bandBottom = mapY(Math.max(c.low, vmin));
    doc.setFillColor(...lighten(green, 0.88));
    doc.rect(x0, bandTop, w, Math.max(bandBottom - bandTop, 0.1), "F");
    doc.setDrawColor(...lighten(green, 0.45));
    doc.setLineWidth(0.2);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(x0, bandTop, x0 + w, bandTop);
    doc.line(x0, bandBottom, x0 + w, bandBottom);
    doc.setLineDashPattern([], 0);

    doc.setDrawColor(...line);
    doc.setLineWidth(0.3);
    doc.rect(x0, top, w, ph);
    setFont("normal", 6, muted);
    [vmin, (vmin + vmax) / 2, vmax].forEach((v) => {
      text(fmtNum(v, c.decimals), x0 - 1.5, mapY(v) + 1, { align: "right" });
    });

    doc.setDrawColor(...lighten(color, 0.6));
    doc.setLineWidth(0.7);
    pts.forEach((b) => {
      const x = mapX(b.start + bucketMs / 2);
      doc.line(x, mapY(b[k].min), x, mapY(b[k].max));
    });
    doc.setDrawColor(...color);
    doc.setLineWidth(0.5);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      doc.line(
        mapX(a.start + bucketMs / 2), mapY(a[k].sum / a[k].n),
        mapX(b.start + bucketMs / 2), mapY(b[k].sum / b[k].n)
      );
    }
    pts.forEach((b) => {
      const flagged = b[k].min < c.low || b[k].max > c.high;
      const x = mapX(b.start + bucketMs / 2), yy = mapY(b[k].sum / b[k].n);
      doc.setFillColor(...(flagged ? red : color));
      doc.circle(x, yy, flagged ? 0.75 : 0.45, "F");
    });

    setFont("normal", 6, muted);
    for (let i = 0; i <= 4; i++) {
      const t = tmin + ((tmax - tmin) * i) / 4;
      const x = x0 + (w * i) / 4;
      text(formatShortStamp(t), x, bottom + 4, { align: i === 0 ? "left" : i === 4 ? "right" : "center" });
      if (tmax === tmin) break;
    }
    y += H;
  }
  KEYS.forEach(drawTrendChart);

  /* ======================================================================
     INTERVAL SUMMARY
     ====================================================================== */
  band(`Interval Summary (${formatInterval(bucketMs)} intervals)`, 44);
  const icol = { time: 2, n: 42, hr: 54, sp: 88, tp: 122, fl: 158 };
  const intervalHead = () =>
    tableHeader(
      [
        { t: "Interval", x: icol.time },
        { t: "N", x: icol.n },
        { t: `Heart Rate (${ranges.heart_rate.unit})`, x: icol.hr },
        { t: `SpO2 (${ranges.spo2.unit})`, x: icol.sp },
        { t: `Temp (${ranges.temperature.unit})`, x: icol.tp },
        { t: "Flags", x: icol.fl },
      ],
      10,
      [
        { t: "min / mean / max", x: icol.hr },
        { t: "min / mean / max", x: icol.sp },
        { t: "min / mean / max", x: icol.tp },
      ]
    );
  if (buckets.length) {
    intervalHead();
    buckets.forEach((b) => {
      if (y + 5.6 > limitY) {
        newPage();
        intervalHead();
      }
      hline(y + 5.6, lineSoft, 0.2);
      const label = bucketMs >= 86400000
        ? formatDateOnly(b.start)
        : `${formatDateOnly(b.start)} ${formatClock(b.start)}-${formatClock(b.end)}`;
      setFont("normal", 7, ink);
      text(label, margin + icol.time, y + 3.9);
      text(b.n, margin + icol.n, y + 3.9);
      const flags = [];
      KEYS.forEach((k, ki) => {
        const s = b[k], c = ranges[k];
        const xs = [icol.hr, icol.sp, icol.tp][ki];
        if (!s.n) {
          setFont("normal", 7, muted);
          text("-", margin + xs, y + 3.9);
          return;
        }
        const low = s.min < c.low, high = s.max > c.high;
        if (low) flags.push(`${c.short} L`);
        if (high) flags.push(`${c.short} H`);
        setFont(low || high ? "bold" : "normal", 7, low || high ? red : ink);
        text(`${fmtNum(s.min, c.decimals)} / ${fmtNum(s.sum / s.n, c.decimals)} / ${fmtNum(s.max, c.decimals)}`, margin + xs, y + 3.9);
      });
      setFont(flags.length ? "bold" : "normal", 6.8, flags.length ? red : green);
      text(flags.length ? flags.join(", ") : "Within range", margin + icol.fl, y + 3.9, { maxWidth: contentWidth - icol.fl - 1 });
      y += 5.6;
    });
    y += 4;
  } else {
    y += 2;
    paragraph("No telemetry readings available for this report.", 7.5, muted);
  }

  /* ======================================================================
     EPISODE LOG
     ====================================================================== */
  band("Out-of-Range Episode Log", 34);
  const ecol = { no: 2, par: 10, dir: 36, sev: 64, start: 84, dur: 120, peak: 140, cnt: 166 };
  const eventHead = () =>
    tableHeader([
      { t: "#", x: ecol.no },
      { t: "Parameter", x: ecol.par },
      { t: "Direction", x: ecol.dir },
      { t: "Severity", x: ecol.sev },
      { t: "Episode Start", x: ecol.start },
      { t: "Duration", x: ecol.dur },
      { t: "Peak Value", x: ecol.peak },
      { t: "Readings", x: ecol.cnt },
    ]);
  if (!rows.length) {
    y += 2;
    paragraph("No telemetry readings available for this report.", 7.5, muted);
  } else if (!episodes.length) {
    y += 2;
    paragraph("No out-of-range episodes were detected in the data window.", 7.5, green);
  } else {
    const MAX_EVENTS = 60;
    let shown = episodes;
    if (episodes.length > MAX_EVENTS) {
      const crit = episodes.filter((e) => e.critical);
      const rest = episodes.filter((e) => !e.critical).slice(0, Math.max(MAX_EVENTS - crit.length, 0));
      shown = [...crit, ...rest].sort((a, b) => a.startT - b.startT);
    }
    eventHead();
    shown.forEach((e, i) => {
      if (y + 5.6 > limitY) {
        newPage();
        eventHead();
      }
      const c = ranges[e.key];
      hline(y + 5.6, lineSoft, 0.2);
      setFont("normal", 7, ink);
      text(i + 1, margin + ecol.no, y + 3.9);
      text(c.short, margin + ecol.par, y + 3.9);
      text(e.flag === "L" ? "Below range (L)" : "Above range (H)", margin + ecol.dir, y + 3.9);
      setFont("bold", 7, e.critical ? red : amber);
      text(e.critical ? "CRITICAL" : "Warning", margin + ecol.sev, y + 3.9);
      setFont("normal", 7, ink);
      text(formatShortStamp(e.startT), margin + ecol.start, y + 3.9);
      text(formatDuration(e.durationMs), margin + ecol.dur, y + 3.9);
      setFont("bold", 7, ink);
      text(`${fmtNum(e.peak, c.decimals)} ${c.unit}`, margin + ecol.peak, y + 3.9);
      setFont("normal", 7, ink);
      text(e.count, margin + ecol.cnt, y + 3.9);
      y += 5.6;
    });
    y += 2;
    if (shown.length < episodes.length) {
      paragraph(
        `${episodes.length - shown.length} further non-critical episode(s) not listed. All critical episodes are included. Full data remains in the NeoCare database.`,
        6.8, muted
      );
    }
    paragraph(
      `Episode = consecutive readings of one parameter outside its reference range. Critical = beyond HR ${ranges.heart_rate.criticalLow}/${ranges.heart_rate.criticalHigh} bpm, ` +
      `SpO2 below ${ranges.spo2.criticalLow}%, or temperature below ${ranges.temperature.criticalLow} / above ${ranges.temperature.criticalHigh} °C. Duration includes one sampling interval.`,
      6.8, muted
    );
  }
  y += 3;

  /* ======================================================================
     PATIENT, GUARDIAN, CARE TEAM
     ====================================================================== */
  band("Patient, Guardian and Care Team Details", 50);
  y += 2;
  const gaWeeks = patient.gestationalAgeWeeks;
  const gaCat = gestationCategory(gaWeeks);
  const bwCat = weightCategory(patient.birthWeightGrams);
  kvGrid([
    ["Date / time of birth", formatDateTime(patient.dateOfBirth), "Blood group", patient.bloodType || "Not recorded"],
    ["Gestational age", gaWeeks ? `${gaWeeks} weeks${gaCat ? ` (${gaCat})` : ""}` : "Not recorded",
      "Birth weight", patient.birthWeightGrams ? `${patient.birthWeightGrams} g${bwCat ? ` (${bwCat})` : ""}` : "Not recorded"],
    ["Primary diagnosis", patient.primarySyndrome || "Not recorded", "Discharge", isDischarged ? formatDateTime(patient.dischargedAt) : "Not discharged"],
    ["Attending physician", doctorName || "Not assigned", "Registration no.", doctor?.licenseNumber || "Not recorded"],
    ["Physician contact", doctor?.phone || doctor?.email || "Not recorded", "Assigned nurse", nurse?.name || "Not assigned"],
    ["Guardian name", patient.guardianName || "Not recorded", "Guardian phone", patient.guardianPhone || "Not recorded"],
    ["National ID / passport", patient.guardianNationalId || "Not recorded", "Address", patient.guardianAddress || "Not recorded"],
  ]);

  /* ======================================================================
     NOTES + DISCHARGE
     ====================================================================== */
  band("Clinical Progress Notes", 30);
  y += 2;
  const sortedNotes = [...(notes || [])].sort(
    (a, b) => (toDate(a.timestamp || a.createdAt)?.getTime() || 0) - (toDate(b.timestamp || b.createdAt)?.getTime() || 0)
  );
  if (!sortedNotes.length) {
    paragraph("No clinical progress notes were recorded for this patient.", 7.5, muted);
  } else {
    sortedNotes.forEach((n) => {
      setFont("normal", 7.8, body);
      const lines = doc.splitTextToSize(n.text || "", contentWidth - 6);
      const h = lines.length * 3.5 + 8.5;
      ensure(h);
      setFont("bold", 7.6, ink);
      const role = n.authorId?.role ? ` (${String(n.authorId.role).replace(/_/g, " ")})` : "";
      text(`${n.authorId?.name || "Unknown author"}${role}  |  ${formatDateTime(n.timestamp || n.createdAt)}`, margin + 2, y + 3.8);
      setFont("normal", 7.8, body);
      text(lines, margin + 2, y + 8);
      hline(y + h - 0.8, lineSoft, 0.2);
      y += h + 1;
    });
  }
  y += 2;

  if (isDischarged) {
    band("Discharge Summary", 30);
    y += 2;
    setFont("bold", 8, ink);
    ensure(6);
    text(`Discharged: ${formatDateTime(patient.dischargedAt)}`, margin + 2, y + 3.5);
    y += 6;
    paragraph(patient.dischargeSummary || "Discharge summary not recorded.", 8, body);
    y += 2;
  }

  ensure(8);
  setFont("normal", 6.5, muted);
  text(`Document consistency code: ${integrityCode} (non-cryptographic checksum of key report values)`, margin, y + 3);
  y += 6;
  ensure(6);
  setFont("italic", 7, muted);
  text("*** End of report ***", pageWidth / 2, y + 3, { align: "center" });

  /* ======================================================================
     FOOTER ON EVERY PAGE: barcode, print info, signatory, disclaimer, address bar
     ====================================================================== */
  const total = doc.getNumberOfPages();
  const facility = hospitalAddress
    ? `${hospitalName}  •  ${systemName}  |  ${hospitalAddress}`
    : `${hospitalName}  •  ${systemName}`;
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    const h = pageHeight;

    drawCode39(mrn, margin, h - 35, 8);
    setFont("normal", 7, ink);
    text(`Print Date: ${generatedAt}`, margin, h - 24);
    text(`P. ${p} / ${total}`, margin + 52, h - 24);
    setFont("normal", 6.5, ink);
    text("This report is intended for doctor's reference only", margin, h - 21);

    if (p === total) {
      const sx = pageWidth - margin - 78;
      setFont("italic", 7, ink);
      text("Authorised Signatory:", sx, h - 33);
      hline(h - 26, muted, 0.3, sx, sx + 76);
      setFont("bold", 8, ink);
      text(doctorName || "Attending physician", sx, h - 22.5);
      setFont("normal", 6.5, muted);
      text(
        `Attending Neonatologist${doctor?.licenseNumber ? `, Reg. ${doctor.licenseNumber}` : ""}`,
        sx, h - 19.5
      );
    }

    hline(h - 17.8, line, 0.2);
    setFont("normal", 6.3, body);
    text(
      doc.splitTextToSize(
        "Monitoring results should always be interpreted by a registered medical practitioner together with the patient's medical history and clinical findings.",
        contentWidth
      ),
      margin, h - 15
    );

    doc.setFillColor(...blue);
    doc.rect(0, h - 12, pageWidth, 5.5, "F");
    setFont("bold", 6.3, [255, 255, 255]);
    text(doc.splitTextToSize(`MAIN FACILITY  |  ${facility}`, pageWidth - 2 * margin)[0], margin, h - 8.4);
    doc.setFillColor(240, 242, 246);
    doc.rect(0, h - 6.5, pageWidth, 6.5, "F");
    setFont("italic", 6.3, muted);
    text(`${systemName} Platform  |  Confidential Medical Record`, margin, h - 2.6);
  }

  if (save) {
    const cleanName = (patient.name || "Patient").replace(/[^a-zA-Z0-9_-]/g, "_");
    doc.save(`NeoCare_Clinical_Report_${cleanName}_${new Date().toISOString().slice(0, 10)}.pdf`);
  }
  return doc;
}
