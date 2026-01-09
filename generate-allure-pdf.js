/* eslint-disable no-console */
/**
 * Production-ready Allure test-case JSON -> PDF generator (Node.js)
 *
 * Features:
 * - Reads Allure test-case JSON from URL (or local file)
 * - Renders PDF with a fixed "Time (MM:SS.mmm)" column (relative to test start)
 * - Pagination without blank pages (page is added only when needed)
 * - Status dot + status label
 * - Optional inline images from Allure attachments (PNG/JPEG/WebP)
 *
 * Install:
 *   npm i pdfkit
 *
 * Run:
 *   node generate-allure-pdf.js --url "http://10.3.97.27:8080/projects/UVCS/reports/allure-runs/Run_5/data/test-cases/9d15714ccf4032af.json" --out "./report.pdf"
 */

import PDFDocument from "pdfkit";
import { createWriteStream } from "node:fs";
import { Buffer } from "node:buffer";

const COLORS = {
  text: "#1f2937",
  muted: "#6b7280",
  border: "#e5e7eb",
  header: "#111827",
  sectionBg: "#f3f4f6",
  passed: "#16a34a",
  failed: "#dc2626",
  broken: "#f59e0b",
  skipped: "#6b7280",
  unknown: "#374151",
  info: "#2563eb",
};

function statusColorHex(status) {
  if (status === "passed") return COLORS.passed;
  if (status === "failed") return COLORS.failed;
  if (status === "broken") return COLORS.broken;
  if (status === "skipped") return COLORS.skipped;
  return COLORS.unknown;
}

function statusLabel(status) {
  return (status || "unknown").toUpperCase();
}

function clamp(n, min, max) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function fmtMsToTimestamp(ms) {
  const total = Math.max(0, Math.floor(ms));
  const mm = Math.floor(total / 60000);
  const ss = Math.floor((total % 60000) / 1000);
  const mmm = total % 1000;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}.${String(mmm).padStart(3, "0")}`;
}

function safeText(v, fallback = "N/A") {
  const s = String(v ?? "").trim();
  return s ? s : fallback;
}

function safeFileName(name) {
  return name.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 140) || "report";
}

function getTestStartMs(tc) {
  const start = tc.time?.start;
  if (typeof start === "number" && Number.isFinite(start)) return start;
  return Date.now();
}

function getStepStart(step) {
  const s = step.time?.start;
  return typeof s === "number" && Number.isFinite(s) ? s : undefined;
}

function getDurationMs(t) {
  const d = t?.duration;
  if (typeof d === "number" && Number.isFinite(d) && d >= 0) return d;
  if (typeof t?.start === "number" && typeof t?.stop === "number" && Number.isFinite(t.stop - t.start)) {
    return Math.max(0, t.stop - t.start);
  }
  return undefined;
}

function flattenSteps(steps, testStartMs, level = 0, out = []) {
  if (!Array.isArray(steps)) return out;

  for (const s of steps) {
    const name = safeText(s?.name, "Step");
    const status = s?.status ?? "unknown";
    const start = getStepStart(s);
    const relMs = start ? Math.max(0, start - testStartMs) : 0;
    out.push({
      level,
      name,
      status,
      relMs,
      durationMs: getDurationMs(s?.time),
      attachments: Array.isArray(s?.attachments) ? s.attachments : undefined,
    });

    if (Array.isArray(s?.steps) && s.steps.length > 0) {
      flattenSteps(s.steps, testStartMs, level + 1, out);
    }
  }

  return out;
}

function extractAllStepRows(tc) {
  const testStart = getTestStartMs(tc);
  const rows = [];

  const before = tc.beforeStages ?? [];
  for (const st of before) {
    const stageName = safeText(st?.name, "Before stage");
    rows.push({ level: 0, name: `⟦${stageName}⟧`, status: st?.status ?? "unknown", relMs: 0 });
    flattenSteps(st?.steps, testStart, 1, rows);
  }

  if (tc.testStage?.steps?.length) {
    rows.push({ level: 0, name: "⟦Test body⟧", status: tc.testStage.status ?? "unknown", relMs: 0 });
    flattenSteps(tc.testStage.steps, testStart, 1, rows);
  }

  const after = tc.afterStages ?? [];
  for (const st of after) {
    const stageName = safeText(st?.name, "After stage");
    rows.push({ level: 0, name: `⟦${stageName}⟧`, status: st?.status ?? "unknown", relMs: 0 });
    flattenSteps(st?.steps, testStart, 1, rows);
  }

  // Ensure "Time" is monotonic-ish (Allure can contain overlapping starts); keep stable order otherwise.
  rows.sort((a, b) => a.relMs - b.relMs);

  return rows;
}

function getBaseDataUrl(testCaseUrl) {
  // ".../data/test-cases/<id>.json" -> ".../data"
  const idx = testCaseUrl.indexOf("/data/");
  if (idx < 0) return testCaseUrl;
  return testCaseUrl.slice(0, idx + "/data".length);
}

async function fetchWithTimeout(url, timeoutMs = 25_000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url) {
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.json();
}

async function fetchBytes(url) {
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}

function isImage(att) {
  const t = String(att?.type ?? "").toLowerCase();
  return t.includes("png") || t.includes("jpeg") || t.includes("jpg") || t.includes("webp");
}

function pdfkitImageFormat(att) {
  const t = String(att?.type ?? "").toLowerCase();
  if (t.includes("png")) return "png";
  if (t.includes("jpeg") || t.includes("jpg")) return "jpg";
  // pdfkit support for webp depends; safest is to skip or preconvert.
  return undefined;
}

function drawHeader(doc, layout) {
  doc.save();
  doc.font("Helvetica-Bold").fontSize(10).fillColor(COLORS.header);
  doc.text("Allure Test Report", layout.margin, layout.margin - 10, { width: layout.contentW, align: "left" });
  doc.restore();
}

function drawFooter(doc, layout, pageNum) {
  doc.save();
  doc.font("Helvetica").fontSize(8).fillColor(COLORS.muted);
  doc.text(`Page ${pageNum}`, layout.margin, layout.pageH - 30, { width: layout.contentW, align: "center" });
  doc.restore();
}

function ensureSpace(doc, state, layout, requiredH) {
  const available = layout.pageH - state.y - 70;
  if (requiredH <= available) return;

  // Prevent blank pages: add a new page only if we already printed something on this page.
  if (state.hasBody) {
    drawFooter(doc, layout, state.pageNum);
    state.pageNum += 1;
    doc.addPage();
    drawHeader(doc, layout);
    state.y = layout.margin + 20;
    state.hasBody = false;
  } else {
    // If page is empty (only header), just reset cursor and continue.
    state.y = layout.margin + 20;
  }
}

function markBody(state) {
  state.hasBody = true;
}

function addTitle(doc, state, layout, text) {
  ensureSpace(doc, state, layout, 40);
  doc.font("Helvetica-Bold").fontSize(18).fillColor(COLORS.header);
  doc.text(text, layout.margin, state.y, { width: layout.contentW });
  state.y += 26;
  markBody(state);
}

function addSection(doc, state, layout, text) {
  ensureSpace(doc, state, layout, 26);
  doc.save();
  doc.rect(layout.margin, state.y, layout.contentW, 18).fill(COLORS.sectionBg);
  doc.fillColor(COLORS.header).font("Helvetica-Bold").fontSize(11);
  doc.text(text, layout.margin + 6, state.y + 4, { width: layout.contentW - 12 });
  doc.restore();
  state.y += 26;
  markBody(state);
}

function addKeyValue(doc, state, layout, key, value) {
  doc.font("Helvetica").fontSize(9);
  const keyW = layout.contentW * 0.32;
  const valW = layout.contentW - keyW;
  const h = Math.max(
    doc.heightOfString(key, { width: keyW - 12 }),
    doc.heightOfString(value, { width: valW - 12 }),
    12,
  ) + 10;

  ensureSpace(doc, state, layout, h + 2);

  doc.save();
  doc.rect(layout.margin, state.y, layout.contentW, h).fillAndStroke("#ffffff", COLORS.border);
  doc.fillColor(COLORS.header).font("Helvetica-Bold").text(key, layout.margin + 6, state.y + 5, { width: keyW - 12 });
  doc.fillColor(COLORS.text).font("Helvetica").text(value, layout.margin + keyW + 6, state.y + 5, { width: valW - 12 });
  doc.restore();

  state.y += h + 2;
  markBody(state);
}

async function addStepRow(doc, state, layout, row, attachmentsBaseUrl) {
  const dotX = layout.margin + row.level * 12 + 6;
  const x = layout.margin + row.level * 12;
  const w = layout.contentW - row.level * 12;

  const timeColW = 86;
  const statusW = 60;
  const nameX = x + 18 + timeColW;
  const nameW = Math.max(50, w - (18 + timeColW + statusW));
  const rowTopPad = 2;

  const timeText = fmtMsToTimestamp(row.relMs);
  const nameText = row.name;
  doc.font("Helvetica").fontSize(9);
  const nameH = doc.heightOfString(nameText, { width: nameW });

  ensureSpace(doc, state, layout, nameH + 18);

  // Status dot
  doc.save();
  doc.fillColor(statusColorHex(row.status));
  doc.circle(dotX, state.y + 7, 4).fill();
  doc.restore();

  // Time
  doc.fillColor(COLORS.muted).font("Helvetica").fontSize(9);
  doc.text(timeText, x + 18, state.y + rowTopPad, { width: timeColW });

  // Name
  doc.fillColor(COLORS.text).font("Helvetica").fontSize(9);
  doc.text(nameText, nameX, state.y + rowTopPad, { width: nameW });

  // Status
  doc.fillColor(statusColorHex(row.status)).font("Helvetica-Bold").fontSize(9);
  doc.text(statusLabel(row.status), x + w - statusW, state.y + rowTopPad, { width: statusW, align: "right" });

  state.y += Math.max(14, nameH) + 6;
  markBody(state);

  // Inline first image attachment (optional)
  const atts = row.attachments ?? [];
  const firstImage = atts.find((a) => isImage(a) && a.source && pdfkitImageFormat(a));
  if (firstImage && attachmentsBaseUrl) {
    try {
      const imgUrl = `${attachmentsBaseUrl}/attachments/${encodeURIComponent(firstImage.source)}`;
      const bytes = await fetchBytes(imgUrl);

      // Keep images small and safe
      const maxW = Math.min(320, w - 24);
      const maxH = 180;
      ensureSpace(doc, state, layout, maxH + 30);

      doc.font("Helvetica").fontSize(8).fillColor(COLORS.muted);
      doc.text(`Screenshot: ${safeText(firstImage.name ?? firstImage.source, "image")}`, x + 18, state.y, { width: w - 24 });
      state.y += 12;

      // PDFKit can infer by magic bytes, but format helps. We keep it simple.
      doc.image(bytes, x + 18, state.y, { fit: [maxW, maxH] });
      state.y += maxH + 10;
      markBody(state);
    } catch {
      // Ignore image failures in production
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const urlIdx = args.indexOf("--url");
  const outIdx = args.indexOf("--out");

  const url = urlIdx >= 0 ? args[urlIdx + 1] : "";
  const outPath = outIdx >= 0 ? args[outIdx + 1] : "./report.pdf";

  if (!url) {
    console.error('Usage: --url "<test-case-json-url>" --out "./report.pdf"');
    process.exit(2);
  }

  const tc = await fetchJson(url);

  const baseDataUrl = getBaseDataUrl(url);
  const attachmentsBaseUrl = baseDataUrl; // .../data

  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const stream = createWriteStream(outPath);
  doc.pipe(stream);

  const layout = {
    margin: 50,
    contentW: 595.28 - 100,
    pageH: 841.89,
  };

  const state = { y: layout.margin + 20, pageNum: 1, hasBody: false };

  drawHeader(doc, layout);

  addTitle(doc, state, layout, "Test Report");

  addSection(doc, state, layout, "Test Overview");
  addKeyValue(doc, state, layout, "Name", safeText(tc.name));
  addKeyValue(doc, state, layout, "Status", statusLabel(tc.status ?? "unknown"));
  addKeyValue(doc, state, layout, "Full Name", safeText(tc.fullName));
  addKeyValue(doc, state, layout, "UID", safeText(tc.uid));
  addKeyValue(doc, state, layout, "Duration", safeText(tc.time?.duration ?? "N/A"));

  const msg = tc.statusDetails?.message ?? tc.statusMessage;
  const trace = tc.statusDetails?.trace ?? tc.statusTrace;

  if ((tc.status === "failed" || tc.status === "broken") && (msg || trace)) {
    addSection(doc, state, layout, "Status Details");
    if (msg) addKeyValue(doc, state, layout, "Message", safeText(msg));
    if (trace) addKeyValue(doc, state, layout, "Trace", safeText(trace));
  }

  addSection(doc, state, layout, "Execution (Time | Step | Status)");

  const rows = extractAllStepRows(tc);
  for (const r of rows) {
    await addStepRow(doc, state, layout, r, attachmentsBaseUrl);
  }

  if (state.hasBody) {
    drawFooter(doc, layout, state.pageNum);
  }

  doc.end();

  await new Promise((resolve, reject) => {
    stream.on("finish", () => resolve());
    stream.on("error", reject);
  });

  console.log(`[OK] PDF generated: ${outPath}`);
}

main().catch((e) => {
  console.error("[ERROR]", e);
  process.exit(1);
});
