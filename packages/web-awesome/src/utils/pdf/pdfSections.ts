import {
  FONT_SIZE_BODY,
  FONT_SIZE_SMALL,
  SPACING_KEY_VALUE,
  SPACING_WRAPPED_BLOCK,
  STEP_COLUMN_DURATION_WIDTH,
  STEP_COLUMN_NAME_WIDTH,
  STEP_COLUMN_STATUS_WIDTH,
} from "./pdfConstants";
import {
  normalizeText,
  stripHtmlToText,
  formatShortDuration,
  getDurationMs,
  getStatusColor,
} from "./pdfUtils";

export function addKeyValue(pdf: any, key: string, value: string, margin: number, yPos: number, pageWidth: number, ensureSpace: (needed: number) => boolean): number {
  const maxWidth = pageWidth - 2 * margin;
  const text = `${key}: ${normalizeText(value)}`;
  const lines = pdf.splitTextToSize(text, maxWidth);
  ensureSpace(lines.length * SPACING_KEY_VALUE + 2);
  pdf.setFontSize(FONT_SIZE_BODY);
  pdf.text(lines, margin, yPos);
  return yPos + lines.length * SPACING_KEY_VALUE + 2;
}

export function addKeyValueWithLink(pdf: any, key: string, value: string, url: string, margin: number, yPos: number, pageWidth: number, ensureSpace: (needed: number) => boolean): number {
  const maxWidth = pageWidth - 2 * margin;
  const keyText = `${key}: `;
  const valueText = normalizeText(value);
  const fullText = `${keyText}${valueText}`;
  const lines = pdf.splitTextToSize(fullText, maxWidth);
  ensureSpace(lines.length * SPACING_KEY_VALUE + 2);
  pdf.setFontSize(FONT_SIZE_BODY);

  const keyWidth = pdf.getTextWidth(keyText);
  let currentY = yPos;
  let isFirstLine = true;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineWithoutKey = line.startsWith(keyText) ? line.substring(keyText.length) : line;

    if (i === 0) {
      pdf.text(keyText, margin, currentY);
      pdf.setTextColor(0, 0, 128);
      pdf.text(lineWithoutKey, margin + keyWidth, currentY);
      pdf.setTextColor(0, 0, 0);
    } else {
      pdf.text(line, margin, currentY);
    }

    if (isFirstLine && lineWithoutKey && url) {
      const valueWidth = pdf.getTextWidth(lineWithoutKey);
      const valueStartX = margin + keyWidth;
      if (typeof pdf.textWithLink === "function") {
        pdf.setTextColor(0, 0, 128);
        pdf.textWithLink(lineWithoutKey, valueStartX, currentY, { url });
        pdf.setTextColor(0, 0, 0);
      } else if (typeof pdf.link === "function") {
        const linkHeight = 5;
        const linkYTop = currentY - 4;
        try {
          pdf.link(valueStartX, linkYTop, valueWidth, linkHeight, { url });
        } catch (e) {
          console.warn("Failed to create link:", e instanceof Error ? e.message : String(e));
        }
      }
      isFirstLine = false;
    }

    currentY += SPACING_KEY_VALUE;
  }

  return currentY + 2;
}

export function addWrappedBlock(pdf: any, label: string | null, body: string, margin: number, yPos: number, pageWidth: number, ensureSpace: (needed: number) => boolean): number {
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

export function getStepColumns(pageWidth: number, margin: number) {
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

export function addStepsHeader(pdf: any, margin: number, yPos: number, pageWidth: number, ensureSpace: (needed: number) => boolean): number {
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

export function addStageTitle(pdf: any, title: string, margin: number, yPos: number, ensureSpace: (needed: number) => boolean): number {
  ensureSpace(10);
  pdf.setFontSize(FONT_SIZE_BODY);
  pdf.setTextColor(40, 40, 40);
  pdf.text(title, margin, yPos);
  pdf.setTextColor(0, 0, 0);
  return yPos + 6;
}
