/* eslint-disable no-console */
import { reportDataUrl } from "@allurereport/web-commons";
import {
  FONT_SIZE_BODY,
  FONT_SIZE_SMALL,
  FONT_SIZE_STEP,
  SPACING_KEY_VALUE,
  SPACING_WRAPPED_BLOCK,
  SPACING_STEP_ROW,
  SPACING_STEP_BASE,
  STEP_COLUMN_DURATION_WIDTH,
  STEP_COLUMN_NAME_WIDTH,
  STEP_COLUMN_STATUS_WIDTH,
  STEP_DOT_RADIUS,
} from "./pdfConstants.js";
import {
  normalizeText,
  stripHtmlToText,
  fetchText,
  formatShortDuration,
  formatDurationMs,
  getDurationMs,
  getStatusColor,
  isImageAttachment,
  addImageToPdf,
  setupUnicodeFont,
  getAllureBaseUrl,
} from "./pdfUtils.js";

export function addKeyValue(pdf, key, value, margin, yPos, pageWidth, ensureSpace) {
  const maxWidth = pageWidth - 2 * margin;
  const text = `${key}: ${normalizeText(value)}`;
  const lines = pdf.splitTextToSize(text, maxWidth);
  ensureSpace(lines.length * SPACING_KEY_VALUE + 2);
  pdf.setFontSize(FONT_SIZE_BODY);
  pdf.text(lines, margin, yPos);
  return yPos + lines.length * SPACING_KEY_VALUE + 2;
}

export function addWrappedBlock(pdf, label, body, margin, yPos, pageWidth, ensureSpace) {
  const maxWidth = pageWidth - 2 * margin;
  const head = label ? `${label}:` : "";
  ensureSpace(6);
  pdf.setFontSize(FONT_SIZE_SMALL);
  if (head) {
    pdf.text(head, margin, yPos);
    yPos += 5;
  }

  let clean = String(body || "");
  clean = clean
    .replace(/\\"/g, '"')
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\\\/g, "\\");
  clean = clean.replace(/\0/g, "").replace(/\uFEFF/g, "");
  const lines = pdf.splitTextToSize(clean, maxWidth);
  ensureSpace(lines.length * SPACING_WRAPPED_BLOCK + 3);
  pdf.setFontSize(8);
  pdf.text(lines, margin, yPos);
  return yPos + lines.length * SPACING_WRAPPED_BLOCK + 3;
}

export function getStepColumns(pageWidth, margin) {
  const contentW = pageWidth - 2 * margin;

  const durW = STEP_COLUMN_DURATION_WIDTH;
  const statusW = STEP_COLUMN_STATUS_WIDTH;
  const gap = 2;

  const durX = margin;
  const nameX = durX + durW + gap;
  const statusX = margin + contentW;

  const nameW = Math.max(60, statusX - nameX - statusW - gap);

  return { durX, nameX, nameW, statusX, statusW };
}

export function addStepsHeader(pdf, margin, yPos, pageWidth, ensureSpace) {
  ensureSpace(10);
  pdf.setFontSize(FONT_SIZE_SMALL);
  pdf.setTextColor(90, 90, 90);

  const cols = getStepColumns(pageWidth, margin);
  pdf.text("Duration", cols.durX, yPos);
  pdf.text("Step", cols.nameX, yPos);
  pdf.text("Status", cols.statusX, yPos, { align: "right" });

  pdf.setTextColor(0, 0, 0);
  return yPos + 6;
}

export function addStageTitle(pdf, title, margin, yPos, ensureSpace) {
  ensureSpace(10);
  pdf.setFontSize(FONT_SIZE_BODY);
  pdf.setTextColor(40, 40, 40);
  pdf.text(title, margin, yPos);
  pdf.setTextColor(0, 0, 0);
  return yPos + 6;
}
