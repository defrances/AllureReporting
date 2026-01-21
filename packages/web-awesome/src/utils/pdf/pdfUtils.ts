import { reportDataUrl } from "@allurereport/web-commons";
import {
  FONT_NOTO_SANS_BASE64,
  FONT_NAME,
  HAS_UNICODE_FONT,
  MAX_IMAGE_WIDTH,
  MAX_IMAGE_HEIGHT,
} from "./pdfConstants";

export function getAllureBaseUrl(): string {
  try {
    const href = String(window.location.href || "");

    const m = href.match(/^(.*\/allure-runs\/[^/]+\/)/i);
    if (m && m[1]) {
      return m[1];
    }

    const m2 = href.match(/^(.*\/projects\/[^/]+\/reports\/allure-runs\/[^/]+\/)/i);
    if (m2 && m2[1]) {
      return m2[1];
    }

    const pathMatch = href.match(/^(.*\/)/);
    if (pathMatch && pathMatch[1]) {
      return pathMatch[1];
    }

    return `${window.location.origin}/`;
  } catch (e) {
    console.warn("[PDF] Failed to get Allure base URL:", e);
    return `${window.location.origin}/`;
  }
}

export function setupUnicodeFont(pdf: any): void {
  try {
    if (HAS_UNICODE_FONT) {
      const fontList = pdf.getFontList();
      if (!fontList || !fontList[FONT_NAME]) {
        pdf.addFileToVFS(`${FONT_NAME}.ttf`, FONT_NOTO_SANS_BASE64);
        pdf.addFont(`${FONT_NAME}.ttf`, FONT_NAME, "normal");
      }
      pdf.setFont(FONT_NAME, "normal");
    } else {
      pdf.setFont("helvetica", "normal");
    }
  } catch (e) {
    console.warn("[PDF] Font setup error, using Helvetica:", e);
    pdf.setFont("helvetica", "normal");
  }
}

export function normalizeText(input: unknown): string {
  let str = String(input ?? "");

  str = str.replace(/./g, (char) => {
    const code = char.charCodeAt(0);
    if (code === 0x00 || code === 0xfeff) {
      return "";
    }
    if ((code >= 0x01 && code <= 0x1f) || code === 0x7f) {
      return " ";
    }
    return char;
  });

  for (let i = 0; i < 5; i++) {
    const before = str;
    str = str
      .replace(/&([A-Za-z0-9_])&/g, "$1")
      .replace(/(^|\s|&)&([A-Za-z0-9_])/g, "$1$2")
      .replace(/([A-Za-z0-9_])&(\s|&|$)/g, "$1$2")
      .replace(/\s+&\s+/g, " ");
    if (str === before) {
      break;
    }
  }

  str = str
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/Ø/g, "O")
    .replace(/Ü/g, "U")
    .replace(/÷/g, "/")
    .replace(/[^\u0020-\u007E]/g, (char) => {
      try {
        const normalized = char.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const asciiRange = /[\u0020-\u007E]/;
        if (!asciiRange.test(normalized)) {
          return "";
        }
        return normalized;
      } catch (e) {
        return "";
      }
    });

  try {
    str = str.normalize("NFKC");
  } catch {
    // Normalization failed, continue with current string
  }

  str = str.replace(/\s+/g, " ").trim();

  return str;
}

export function stripHtmlToText(html: unknown): string {
  const s = String(html || "");
  const noScripts = s.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "");
  const withNl = noScripts.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n");
  let text = withNl.replace(/<[^>]+>/g, " ");

  try {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = text;
    text = textarea.value || textarea.textContent || text;
  } catch (e) {
    text = text
      .replace(/&#x([0-9A-Fa-f]+);/g, (match, hex) => {
        try {
          return String.fromCharCode(parseInt(hex, 16));
        } catch (e) {
          return match;
        }
      })
      .replace(/&#(\d+);/g, (match, dec) => {
        try {
          return String.fromCharCode(parseInt(dec, 10));
        } catch (e) {
          return match;
        }
      })
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&");
  }

  text = text
    .replace(/&([A-Za-z0-9_])\s*&/g, "$1")
    .replace(/(^|\s)&([A-Za-z0-9_])/g, "$1$2")
    .replace(/([A-Za-z0-9_])\s*&(\s|$)/g, "$1$2")
    .replace(/\s+&\s+/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  text = text
    .replace(/\\"/g, '"')
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\\\/g, "\\")
    .replace(/\0/g, "")
    .replace(/\uFEFF/g, "");

  return text;
}

export function formatDurationMs(ms: number): string {
  const total = Math.max(0, Math.floor(Number(ms) || 0));
  const hours = Math.floor(total / 3600000);
  const minutes = Math.floor((total % 3600000) / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const milliseconds = total % 1000;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}

export function formatShortDuration(ms: number): string {
  const v = Math.max(0, Math.floor(Number(ms) || 0));
  if (v < 1000) {
    return `${v}ms`;
  }
  const s = v / 1000;
  if (s < 60) {
    return `${s.toFixed(1)}s`;
  }
  const m = Math.floor(s / 60);
  const r = (s % 60).toFixed(1);
  return `${m}m ${r}s`;
}

export function getStatusColor(status: string): [number, number, number] {
  switch (status) {
    case "passed":
      return [22, 163, 74];
    case "failed":
      return [220, 38, 38];
    case "broken":
      return [245, 158, 11];
    case "skipped":
      return [107, 114, 128];
    default:
      return [55, 65, 81];
  }
}

export function isImageAttachment(attachment: { type?: string }): boolean {
  if (!attachment || !attachment.type) {
    return false;
  }
  const type = String(attachment.type).toLowerCase();
  return (
    type === "image/png" ||
    type === "image/jpeg" ||
    type === "image/jpg" ||
    type === "image/webp" ||
    type.startsWith("image/")
  );
}

export function getDurationMs(timeObj?: { duration?: number; start?: number; stop?: number }, fallbackDuration?: number): number | null {
  const d = timeObj?.duration;
  if (Number.isFinite(d) && d >= 0) {
    return d;
  }

  const s = timeObj?.start;
  const e = timeObj?.stop;
  if (Number.isFinite(s) && Number.isFinite(e) && e >= s) {
    return e - s;
  }

  if (Number.isFinite(fallbackDuration) && fallbackDuration >= 0) {
    return fallbackDuration;
  }
  return null;
}

export async function addImageToPdf(
  pdf: any,
  imageUrl: string,
  attachment: { name?: string; source?: string; type?: string },
  x: number,
  yPos: number,
  pageWidth: number,
  pageHeight: number,
  setupUnicodeFontFn: (pdf: any) => void,
): Promise<number> {
  return new Promise((resolve) => {
    try {
      const maxImageHeight = 110;
      if (yPos + maxImageHeight > pageHeight - 16) {
        pdf.addPage();
        setupUnicodeFontFn(pdf);
        yPos = 16;
      }

      const img = new Image();
      img.crossOrigin = "anonymous";

      img.onload = () => {
        try {
          const maxWidth = pageWidth - x - 16;
          const maxHeight = Math.min(maxImageHeight, pageHeight - yPos - 16);

          const pxToMm = 0.264583;
          let imgWidth = img.width * pxToMm;
          let imgHeight = img.height * pxToMm;

          const scale = Math.min(maxWidth / imgWidth, maxHeight / imgHeight, 1);
          imgWidth *= scale;
          imgHeight *= scale;

          pdf.setFontSize(8);
          pdf.setTextColor(110, 110, 110);
          const imageName = normalizeText(attachment?.name || attachment?.source || "Screenshot");
          pdf.text(`Image: ${imageName}`, x, yPos);
          yPos += 5;

          let format = "PNG";
          const t = String(attachment.type || "").toLowerCase();
          if (t.includes("jpeg") || t.includes("jpg")) {
            format = "JPEG";
          }
          if (t.includes("png")) {
            format = "PNG";
          }
          if (t.includes("webp")) {
            resolve(yPos);
            return;
          }

          pdf.addImage(imageUrl, format, x, yPos, imgWidth, imgHeight);
          yPos += imgHeight + 5;

          pdf.setTextColor(0, 0, 0);
          resolve(yPos);
        } catch (e) {
          console.error("Error adding image to PDF:", e);
          resolve(yPos);
        }
      };

      img.onerror = () => resolve(yPos);
      img.src = imageUrl;
    } catch (e) {
      console.error("Error processing image attachment:", e);
      resolve(yPos);
    }
  });
}

export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url).catch(() => null);
  if (!res || !res.ok) {
    throw new Error(`HTTP ${res?.status || "unknown"} for ${url}`);
  }

  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);

  let encoding = "utf-8";
  if (bytes.length >= 2) {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
      encoding = "utf-16le";
    } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
      encoding = "utf-16be";
    }
  }
  if (bytes.length >= 3) {
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      encoding = "utf-8";
    }
  }

  if (encoding === "utf-8" && bytes.length > 0) {
    let zeroCount = 0;
    const sampleSize = Math.min(bytes.length, 2000);
    const sample = bytes.subarray(0, sampleSize);
    for (let i = 0; i < sample.length; i++) {
      if (sample[i] === 0x00) {
        zeroCount++;
      }
    }
    if (zeroCount > sampleSize * 0.1) {
      encoding = "utf-16le";
    }
  }

  const text = new TextDecoder(encoding, { fatal: false }).decode(buf);

  return text.replace(/\uFEFF/g, "").replace(/\0/g, "");
}
