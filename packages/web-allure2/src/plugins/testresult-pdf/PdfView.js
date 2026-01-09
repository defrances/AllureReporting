/* eslint-disable no-console */
import { jsPDF } from "jspdf";
import { View } from "backbone.marionette";
import { className, on } from "@/decorators/index.js";
import { reportDataUrl } from "@allurereport/web-commons";
import template from "./PdfView.hbs";
import "./styles.scss";

/**
 * NOTE (Unicode / "Ø=Ü÷ ..." fix):
 * jsPDF default fonts are not Unicode-safe. Use a real TTF font.
 * 1) Download NotoSans-Regular.ttf (or Roboto-Regular.ttf)
 * 2) Convert to base64: node -e "console.log(require('fs').readFileSync('NotoSans-Regular.ttf').toString('base64'))"
 * 3) Paste base64 below
 */
const FONT_NOTO_SANS_BASE64 = ""; // TODO: put base64 of NotoSans-Regular.ttf here
const FONT_NAME = "NotoSans";
const HAS_UNICODE_FONT = FONT_NOTO_SANS_BASE64 && FONT_NOTO_SANS_BASE64.length > 0;

@className("pdf-view")
class PdfView extends View {
  template = template;

  initialize() {
    this.model = this.options.model;
  }

  @on("click .pdf-download-button")
  async onDownloadPdf() {
    const button = this.$(".pdf-download-button");
    const originalText = button.find("span").text();

    try {
      button.prop("disabled", true);
      button.find("span").text(this.translate("testResult.pdf.generating", "Generating PDF..."));

      const testData = this.model.toJSON();
      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      // --- Fonts (Unicode-safe) ---
      this.setupUnicodeFont(pdf);

      const margin = 16; // smaller margin => content more to the left
      let yPos = margin;

      const ensureSpace = (needed) => {
        const h = Math.max(0, Math.min(10000, Number(needed) || 0));
        if (yPos + h > pageHeight - margin) {
          pdf.addPage();
          this.setupUnicodeFont(pdf);
          yPos = margin;
          return true;
        }
        return false;
      };
      
      // Title
      this.setupUnicodeFont(pdf);
      pdf.setFontSize(18);
      pdf.text("Test Report", pageWidth / 2, yPos, { align: "center" });
      yPos += 12;

      // Overview
      pdf.setFontSize(12);
      this.setupUnicodeFont(pdf);
      pdf.text("Test Overview", margin, yPos);
      yPos += 7;

      pdf.setFontSize(10);
      yPos = this.addKeyValue(pdf, "Name", testData.name || "N/A", margin, yPos, pageWidth, ensureSpace);
      yPos = this.addKeyValue(pdf, "Status", String(testData.status || "unknown").toUpperCase(), margin, yPos, pageWidth, ensureSpace);
      yPos = this.addKeyValue(pdf, "Full Name", testData.fullName || "N/A", margin, yPos, pageWidth, ensureSpace);
      yPos = this.addKeyValue(pdf, "UID", testData.uid || "N/A", margin, yPos, pageWidth, ensureSpace);

      const durationMs = testData.time?.duration;
      // Format duration without normalizeText to preserve space in "49s 306ms"
      const durationText = Number.isFinite(durationMs) ? this.formatDurationMs(durationMs) : "N/A";
      const maxWidth = pageWidth - 2 * margin;
      const text = `Duration: ${durationText}`;
      const lines = pdf.splitTextToSize(text, maxWidth);
      ensureSpace(lines.length * 5 + 2);
      pdf.setFontSize(10);
      pdf.text(lines, margin, yPos);
      yPos += lines.length * 5 + 2;

      // Attachments (zip files, especially RanorexFullReport.zip)
      yPos = await this.addTestAttachments(pdf, testData, margin, yPos, pageWidth, ensureSpace);

      // Status Details (test-level)
      const msg = testData.statusDetails?.message || testData.statusMessage;
      const trace = testData.statusDetails?.trace || testData.statusTrace;
      if ((testData.status === "failed" || testData.status === "broken") && (msg || trace)) {
        yPos += 4;
        ensureSpace(30);
        pdf.setFontSize(12);
        pdf.text("Status Details", margin, yPos);
        yPos += 7;
        pdf.setFontSize(9);

        if (msg) {
          yPos = this.addWrappedBlock(pdf, "Message", String(msg), margin, yPos, pageWidth, ensureSpace);
        }
        if (trace) {
          yPos = this.addWrappedBlock(pdf, "Trace", String(trace), margin, yPos, pageWidth, ensureSpace);
        }
      }

      // Execution
      yPos += 6;
      ensureSpace(20);
      pdf.setFontSize(12);
      pdf.text("Execution", margin, yPos);
      yPos += 8;

      // Column headers for steps (Time | Duration | Name | Status)
      yPos = this.addStepsHeader(pdf, margin, yPos, pageWidth, ensureSpace);

      const hasBeforeStages = Array.isArray(testData.beforeStages) && testData.beforeStages.length > 0;
      const hasTestStage = Array.isArray(testData.testStage?.steps) && testData.testStage.steps.length > 0;
      const hasAfterStages = Array.isArray(testData.afterStages) && testData.afterStages.length > 0;

      if (hasBeforeStages || hasTestStage || hasAfterStages) {
        const testStart = testData.time?.start || Date.now();

        if (hasBeforeStages) {
          yPos = this.addStageTitle(pdf, "Set up", margin, yPos, ensureSpace);
          for (const st of testData.beforeStages) {
            if (Array.isArray(st?.steps)) {
              yPos = await this.addStepsToPdf(pdf, st.steps, margin, yPos, pageWidth, pageHeight, ensureSpace, testStart, 0);
            }
          }
        }

        if (hasTestStage) {
          yPos = this.addStageTitle(pdf, "Test body", margin, yPos, ensureSpace);
          yPos = await this.addStepsToPdf(pdf, testData.testStage.steps, margin, yPos, pageWidth, pageHeight, ensureSpace, testStart, 0);
        }

        if (hasAfterStages) {
          yPos = this.addStageTitle(pdf, "Tear down", margin, yPos, ensureSpace);
          for (const st of testData.afterStages) {
            if (Array.isArray(st?.steps)) {
              yPos = await this.addStepsToPdf(pdf, st.steps, margin, yPos, pageWidth, pageHeight, ensureSpace, testStart, 0);
            }
          }
        }
      }

      // Save
      const fileName = `${String(testData.name || "test").replace(/[^a-z0-9]/gi, "_").slice(0, 50)}.pdf`;
      pdf.save(fileName);
    } catch (error) {
      console.error("Error generating PDF:", error);
      const button = this.$(".pdf-download-button");
      button.prop("disabled", false);
      button.find("span").text(this.translate("testResult.pdf.error", "Error generating PDF"));
    } finally {
      const button = this.$(".pdf-download-button");
      button.prop("disabled", false);
      button.find("span").text(originalText);
    }
  }

  // ----------------- Core changes -----------------

  getAllureBaseUrl() {
    try {
      const href = String(window.location.href || "");
      console.log("[PDF] Current location:", href);

      // ищем .../allure-runs/Run_5/ (или любой другой run)
      const m = href.match(/^(.*\/allure-runs\/[^/]+\/)/i);
      if (m && m[1]) {
        const baseUrl = m[1];
        console.log("[PDF] Found allure-runs base URL:", baseUrl);
        return baseUrl;
      }

      // альтернатива: ищем паттерн .../projects/PROJECT/reports/allure-runs/Run_X/
      const m2 = href.match(/^(.*\/projects\/[^/]+\/reports\/allure-runs\/[^/]+\/)/i);
      if (m2 && m2[1]) {
        const baseUrl = m2[1];
        console.log("[PDF] Found projects/reports base URL:", baseUrl);
        return baseUrl;
      }

      // fallback: используем текущий путь до последнего слэша
      const pathMatch = href.match(/^(.*\/)/);
      if (pathMatch && pathMatch[1]) {
        const baseUrl = pathMatch[1];
        console.log("[PDF] Using path-based base URL:", baseUrl);
        return baseUrl;
      }

      // последний fallback: просто origin + "/"
      const fallback = `${window.location.origin}/`;
      console.log("[PDF] Using origin fallback:", fallback);
      return fallback;
    } catch (e) {
      console.warn("[PDF] Failed to get Allure base URL:", e);
      return `${window.location.origin}/`;
    }
  }

  setupUnicodeFont(pdf) {
    try {
      if (HAS_UNICODE_FONT) {
        // Add only once per instance (jsPDF stores in VFS)
        const fontList = pdf.getFontList();
        if (!fontList || !fontList[FONT_NAME]) {
          pdf.addFileToVFS(`${FONT_NAME}.ttf`, FONT_NOTO_SANS_BASE64);
          pdf.addFont(`${FONT_NAME}.ttf`, FONT_NAME, "normal");
        }
        pdf.setFont(FONT_NAME, "normal");
      } else {
        // Fallback
        pdf.setFont("helvetica", "normal");
      }
    } catch (e) {
      console.warn("Unicode font init failed, using helvetica:", e);
      pdf.setFont("helvetica", "normal");
    }
  }

  addKeyValue(pdf, key, value, margin, yPos, pageWidth, ensureSpace) {
    const maxWidth = pageWidth - 2 * margin;
    const text = `${key}: ${this.normalizeText(value)}`;
    const lines = pdf.splitTextToSize(text, maxWidth);
    ensureSpace(lines.length * 5 + 2);
    pdf.setFontSize(10);
    pdf.text(lines, margin, yPos);
    return yPos + lines.length * 5 + 2;
  }

  addWrappedBlock(pdf, label, body, margin, yPos, pageWidth, ensureSpace) {
    const maxWidth = pageWidth - 2 * margin;
    const head = `${label}:`;
    ensureSpace(6);
    pdf.setFontSize(9);
    pdf.text(head, margin, yPos);
    yPos += 5;

    // Don't use normalizeText for Status Details messages to preserve spaces
    // Decode JSON escape sequences and remove only NULL bytes and BOM
    let clean = String(body || "");
    // Decode escaped quotes and other JSON escape sequences
    clean = clean
      .replace(/\\"/g, '"')  // \" -> "
      .replace(/\\n/g, "\n") // \n -> newline
      .replace(/\\t/g, "\t") // \t -> tab
      .replace(/\\\\/g, "\\"); // \\ -> \
    // Remove only NULL bytes and BOM, but preserve spaces
    clean = clean.replace(/\0/g, "").replace(/\uFEFF/g, "");
    const lines = pdf.splitTextToSize(clean, maxWidth);
    ensureSpace(lines.length * 4 + 3);
    pdf.setFontSize(8);
    pdf.text(lines, margin, yPos);
    return yPos + lines.length * 4 + 3;
  }

  async addTestAttachments(pdf, testData, margin, yPos, pageWidth, ensureSpace) {
    // Collect all attachments from test level and all stages/steps
    const attachments = [];

    // Test level attachments
    if (Array.isArray(testData.attachments) && testData.attachments.length > 0) {
      attachments.push(...testData.attachments);
    }

    // Helper to recursively collect attachments from steps
    const collectFromSteps = (steps) => {
      if (!Array.isArray(steps)) {
        return;
      }
      for (const step of steps) {
        if (step?.attachments && Array.isArray(step.attachments)) {
          attachments.push(...step.attachments);
        }
        if (step?.steps && Array.isArray(step.steps)) {
          collectFromSteps(step.steps);
        }
      }
    };

    // Collect from beforeStages
    if (Array.isArray(testData.beforeStages)) {
      for (const stage of testData.beforeStages) {
        if (stage?.attachments && Array.isArray(stage.attachments)) {
          attachments.push(...stage.attachments);
        }
        if (stage?.steps) {
          collectFromSteps(stage.steps);
        }
      }
    }

    // Collect from testStage
    if (testData.testStage) {
      if (testData.testStage.attachments && Array.isArray(testData.testStage.attachments)) {
        attachments.push(...testData.testStage.attachments);
      }
      if (testData.testStage.steps) {
        collectFromSteps(testData.testStage.steps);
      }
    }

    // Collect from afterStages
    if (Array.isArray(testData.afterStages)) {
      for (const stage of testData.afterStages) {
        if (stage?.attachments && Array.isArray(stage.attachments)) {
          attachments.push(...stage.attachments);
        }
        if (stage?.steps) {
          collectFromSteps(stage.steps);
        }
      }
    }

    // Find zip files, especially RanorexFullReport.zip
    const zipAttachments = attachments.filter((att) => {
      if (!att || !att.source) {
        return false;
      }
      const name = String(att.name || att.source || "").toLowerCase();
      const type = String(att.type || "").toLowerCase();
      return type.includes("zip") || name.endsWith(".zip");
    });

    if (zipAttachments.length === 0) {
      return yPos;
    }

    // Sort: RanorexFullReport.zip first
    zipAttachments.sort((a, b) => {
      const aName = String(a.name || a.source || "").toLowerCase();
      const bName = String(b.name || b.source || "").toLowerCase();
      const aIsRanorex = aName.includes("ranorexfullreport");
      const bIsRanorex = bName.includes("ranorexfullreport");
      if (aIsRanorex && !bIsRanorex) {
        return -1;
      }
      if (!aIsRanorex && bIsRanorex) {
        return 1;
      }
      return aName.localeCompare(bName);
    });

    yPos += 4;
    ensureSpace(10);
    pdf.setFontSize(10);
    pdf.setTextColor(0, 0, 0);
    pdf.text("Attachments", margin, yPos);
      yPos += 7;

    pdf.setFontSize(9);
    const baseUrl = this.getAllureBaseUrl();
    console.log("[PDF] Total zip attachments found:", zipAttachments.length);

    for (const att of zipAttachments) {
      const attName = String(att.name || att.source || "attachment.zip");
      // Build absolute HTTP(S) URL for PDF link (not blob/data URL)
      const attUrl = `${baseUrl}data/attachments/${att.source}`;
      console.log("[PDF] Adding attachment link:", attName, "->", attUrl);

      ensureSpace(6);
      pdf.setTextColor(0, 0, 128); // Blue color for links

      // Use textWithLink if available, otherwise use text + link
      const x = margin + 5;
      if (typeof pdf.textWithLink === "function") {
        console.log("[PDF] Using textWithLink for:", attName);
        pdf.textWithLink(attName, x, yPos, { url: attUrl });
      } else {
        console.log("[PDF] Using text + link for:", attName);
        pdf.text(attName, x, yPos);
        const textWidth = pdf.getTextWidth(attName);
        // Improved hitbox: slightly higher and taller for better clickability
        pdf.link(x, yPos - 5, textWidth, 7, { url: attUrl });
      }

      pdf.setTextColor(0, 0, 0);
      yPos += 6;
    }

    return yPos;
  }

  addStepsHeader(pdf, margin, yPos, pageWidth, ensureSpace) {
    ensureSpace(10);
    pdf.setFontSize(9);
    pdf.setTextColor(90, 90, 90);

    const cols = this.getStepColumns(pageWidth, margin);
    pdf.text("Duration", cols.durX, yPos);
    pdf.text("Step", cols.nameX, yPos);
    pdf.text("Status", cols.statusX, yPos, { align: "right" });

    pdf.setTextColor(0, 0, 0);
    return yPos + 6;
  }

  addStageTitle(pdf, title, margin, yPos, ensureSpace) {
    ensureSpace(10);
      pdf.setFontSize(10);
    pdf.setTextColor(40, 40, 40);
    pdf.text(title, margin, yPos);
    pdf.setTextColor(0, 0, 0);
    return yPos + 6;
  }

  getStepColumns(pageWidth, margin) {
    const contentW = pageWidth - 2 * margin;

    // More left + stable columns
    const durW = 20;      // "12.3s"
    const statusW = 20;   // "PASSED"
    const gap = 2;

    const durX = margin;
    const nameX = durX + durW + gap;
    const statusX = margin + contentW;

    const nameW = Math.max(60, statusX - nameX - statusW - gap);

    return { durX, nameX, nameW, statusX, statusW };
  }

  async addStepsToPdf(
    pdf,
    steps,
    margin,
    startY,
    pageWidth,
    pageHeight,
    ensureSpace,
    testStart,
    indent,
  ) {
    let yPos = startY;

    const addStep = async (step, level) => {
      if (!step) {
        return;
      }

      // 1) EXCLUDE "Step table" COMPLETELY
      const stepNameRaw = String(step?.name || "Step");
      if (stepNameRaw.trim().toLowerCase() === "step table") {
        return;
      }

      // If we have nested "attachmentStep" rows that are purely "Step table" - skip as well
      if (step?.attachmentStep && stepNameRaw.trim().toLowerCase() === "step table") {
        return;
      }

      // Check if step name matches NGPVHOST_*_trace pattern (completely skip rendering the step name, but keep images)
      const isTraceStep = /^NGPVHOST_.*_trace$/i.test(stepNameRaw.trim());

      // Check if step name contains "RanorexFullReport.zip" (hide status and duration)
      const isRanorexReportStep = /ranorexfullreport\.zip/i.test(stepNameRaw.trim());

      // Check if step itself is named "Step Details" (hide status and duration)
      const isStepDetailsStep = stepNameRaw.trim().toLowerCase() === "step details";

      // Check if step has nested "Step Details" step (hide status and duration only for these)
      // Note: We check only for nested "Step Details" step, not for statusMessage/statusTrace
      // because those can exist on any step and don't indicate we should hide status/duration
      const hasNestedStepDetails =
        Array.isArray(step?.steps) && step.steps.some((s) => String(s?.name || "").trim().toLowerCase() === "step details");

      // Determine if we should hide status and duration
      const hideStatusAndDuration = isTraceStep || isRanorexReportStep || isStepDetailsStep || hasNestedStepDetails;

      // For trace steps, skip rendering the step name/status/duration completely, but keep images
      if (isTraceStep) {
        // Skip rendering step name, status, duration, dot, and Step Details
        // But continue to render images and sub-steps
        // Render images directly
        if (Array.isArray(step?.attachments) && step.attachments.length > 0) {
          for (const att of step.attachments) {
            if (!att) {
              continue;
            }
            const attName = String(att?.name || "").trim().toLowerCase();
            if (attName === "step table") {
              continue;
            }

            if (this.isImageAttachment(att)) {
              try {
                const imageUrl = await reportDataUrl(`data/attachments/${att.source}`, att.type);
                if (imageUrl) {
                  yPos = await this.addImageToPdf(pdf, imageUrl, att, margin, yPos, pageWidth, pageHeight);
                }
              } catch (e) {
                console.error("Error loading image attachment:", att?.source, e);
              }
            }
          }
        }

        // Render sub-steps
        if (Array.isArray(step?.steps) && step.steps.length > 0) {
          for (const sub of step.steps) {
            await addStep(sub, level + 1);
          }
        }
        return; // Skip the rest of step rendering (name, status, duration, Step Details)
      }

      // Page break
      if (yPos > pageHeight - 25) {
        pdf.addPage();
        this.setupUnicodeFont(pdf);
        yPos = margin;
      }

      const cols = this.getStepColumns(pageWidth, margin);
      const levelIndent = Math.min(16, level * 3); // small indent => "shift left" requirement
      const dotX = cols.nameX - 3 + levelIndent;

      const status = step?.status || "unknown";
      const statusColor = this.getStatusColor(status);

      // --- Duration (real, from Allure) ---
      const durationMs = this.getDurationMs(step?.time, step?.duration);
      const durationText = durationMs !== null ? this.formatShortDuration(durationMs) : "N/A";

      // --- Name (wrapped) ---
      const nameText = this.normalizeText(stepNameRaw);
      pdf.setFontSize(9);

      const availableNameW = cols.nameW - levelIndent;
      const nameLines = pdf.splitTextToSize(nameText, availableNameW);

      // Height estimation
      const baseLineH = 4.2;
      const rowH = Math.max(6, nameLines.length * baseLineH);

      ensureSpace(rowH + 2);

      // Dot (skip for trace steps or steps with Step Details)
      if (!hideStatusAndDuration) {
        pdf.setFillColor(...statusColor);
        pdf.circle(dotX, yPos - 1.5, 1.6, "F");
      }

      // Columns (skip duration and status for trace steps or steps with Step Details)
      if (!hideStatusAndDuration) {
        pdf.setTextColor(90, 90, 90);
        pdf.text(durationText, cols.durX, yPos);
        pdf.setTextColor(0, 0, 0);
      }

      // Name lines
      nameLines.forEach((line, i) => {
        if (i > 0) {
          ensureSpace(baseLineH);
        }
        pdf.text(line, cols.nameX + levelIndent, yPos + i * baseLineH);
      });

      // Status label (skip for trace steps or steps with Step Details)
      if (!hideStatusAndDuration) {
        pdf.setTextColor(...statusColor);
        pdf.text(String(status).toUpperCase(), cols.statusX, yPos, { align: "right" });
        pdf.setTextColor(0, 0, 0);
      }

      yPos += rowH + 1;

      // 2) Step Details: print ALL that belongs to it
      // Skip renderStepDetails for steps named "Step Details" themselves (they are already rendered)
      if (!isStepDetailsStep) {
        yPos = await this.renderStepDetails(pdf, step, margin, yPos, pageWidth, ensureSpace, levelIndent);
      }

      // 3) Attachments (images only; and exclude step table attachments by name)
      if (Array.isArray(step?.attachments) && step.attachments.length > 0) {
        for (const att of step.attachments) {
          if (!att) {
            continue;
          }
          const attName = String(att?.name || "").trim().toLowerCase();
          if (attName === "step table") {
            continue;
          }

          if (this.isImageAttachment(att)) {
            try {
              const imageUrl = await reportDataUrl(`data/attachments/${att.source}`, att.type);
              if (imageUrl) {
                yPos = await this.addImageToPdf(pdf, imageUrl, att, cols.nameX + levelIndent, yPos, pageWidth, pageHeight);
              }
            } catch (e) {
              console.error("Error loading image attachment:", att?.source, e);
            }
          }
        }
      }

      // 4) Sub-steps (exclude "Step Details" as they are already rendered via renderStepDetails)
      if (Array.isArray(step?.steps) && step.steps.length > 0) {
        for (const sub of step.steps) {
          // Skip "Step Details" steps - they are already rendered in renderStepDetails
          const subName = String(sub?.name || "").trim().toLowerCase();
          if (subName === "step details") {
            continue;
          }
          await addStep(sub, level + 1);
        }
      }
    };

    for (const s of steps) {
      await addStep(s, indent);
    }

    return yPos;
  }

  async renderStepDetails(
    pdf,
    step,
    margin,
    yPos,
    pageWidth,
    ensureSpace,
    levelIndent,
  ) {
    const maxWidth = pageWidth - 2 * margin - levelIndent;
    const x = margin + levelIndent;

    // 1) Direct status details
    const msg = step?.statusDetails?.message || step?.statusMessage;
    const trace = step?.statusDetails?.trace || step?.statusTrace;

    // 2) Nested "Step Details" node (like in your sample)
    const nestedDetailsText = await this.extractNestedStepDetailsText(step);

    const parts = [];

    if (msg) {
      parts.push({ title: "Message", text: String(msg) });
    }
    if (trace) {
      parts.push({ title: "Trace", text: String(trace) });
    }
    if (nestedDetailsText) {
      parts.push({ title: "Step Details", text: nestedDetailsText });
    }

    if (parts.length === 0) {
    return yPos;
  }

    ensureSpace(8);
          pdf.setFontSize(8);
    pdf.setTextColor(110, 110, 110);
    pdf.text("Step Details:", x, yPos);
            yPos += 5;

    for (const p of parts) {
      // Skip header for "Step Details" part to avoid duplication (we already have "Step Details:" above)
      const skipHeader = p.title === "Step Details";

      if (!skipHeader) {
        const header = `${p.title}:`;
        ensureSpace(6);
        pdf.setFontSize(8);
        pdf.setTextColor(90, 90, 90);
        pdf.text(header, x, yPos);
        yPos += 4;
      } else {
          yPos += 2;
      }

      // Don't use normalizeText for Step Details messages to preserve spaces
      // Text already cleaned by stripHtmlToText, so just remove NULL bytes and control chars
      let clean = String(p.text || "");
      // Decode escaped quotes and other JSON escape sequences
      clean = clean
        .replace(/\\"/g, '"')  // \" -> "
        .replace(/\\n/g, "\n") // \n -> newline
        .replace(/\\t/g, "\t") // \t -> tab
        .replace(/\\\\/g, "\\"); // \\ -> \
      // Remove only NULL bytes and BOM, but preserve spaces
      clean = clean.replace(/\0/g, "").replace(/\uFEFF/g, "");
      const lines = pdf.splitTextToSize(clean, maxWidth);
      ensureSpace(lines.length * 3.8 + 2);

      pdf.setFontSize(7.5);
      pdf.setTextColor(40, 40, 40);
      pdf.text(lines, x, yPos);
      yPos += lines.length * 3.8 + 3;
    }

    pdf.setTextColor(0, 0, 0);
    return yPos;
  }

  async extractNestedStepDetailsText(step) {
    // Find a nested step named "Step Details" ONLY in direct children (not recursively)
    // This prevents duplication when multiple nested steps have "Step Details"
    if (!Array.isArray(step?.steps)) {
      return null;
    }

    for (const cur of step.steps) {
      if (!cur) {
        continue;
      }

      const nm = String(cur?.name || "").trim().toLowerCase();
      if (nm === "step table") {
        continue;
      }

      if (nm === "step details") {
        const atts = Array.isArray(cur?.attachments) ? cur.attachments : [];
        const textAtt = atts.find((a) => {
          const t = String(a?.type || "").toLowerCase();
          const name = String(a?.name || "").trim().toLowerCase();
          if (name === "step table") {
            return false;
          }
          return t.includes("text/plain") || t.includes("text/html");
        });

        if (textAtt?.source) {
          try {
            const url = await reportDataUrl(`data/attachments/${textAtt.source}`, textAtt.type);
            if (!url) {
              return null;
            }
            const raw = await this.fetchText(url);
            return this.stripHtmlToText(raw);
          } catch (e) {
            console.error("Failed to load nested Step Details attachment:", e);
            return null;
          }
        }
      }
    }
    return null;
  }

  async fetchText(url) {
    const res = await fetch(url).catch(() => null);
    if (!res || !res.ok) {
      throw new Error(`HTTP ${res?.status || "unknown"} for ${url}`);
    }

    // Get arrayBuffer to detect encoding properly
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);

    // --- 1) Detect BOM (Byte Order Mark) ---
    let encoding = "utf-8";
    if (bytes.length >= 2) {
      if (bytes[0] === 0xFF && bytes[1] === 0xFE) {
        encoding = "utf-16le"; // UTF-16 Little Endian
      } else if (bytes[0] === 0xFE && bytes[1] === 0xFF) {
        encoding = "utf-16be"; // UTF-16 Big Endian
      }
    }
    if (bytes.length >= 3) {
      if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
        encoding = "utf-8"; // UTF-8 with BOM
      }
    }

    // --- 2) Heuristic: many zero bytes => UTF-16LE ---
    // UTF-16LE often has many null bytes (0x00) in high bytes of ASCII characters
    if (encoding === "utf-8" && bytes.length > 0) {
      let zeroCount = 0;
      const sampleSize = Math.min(bytes.length, 2000);
      const sample = bytes.subarray(0, sampleSize);
      for (let i = 0; i < sample.length; i++) {
        if (sample[i] === 0x00) {
          zeroCount++;
        }
      }
      // If more than 10% are zeros, likely UTF-16LE
      if (zeroCount > sampleSize * 0.1) {
        encoding = "utf-16le";
      }
    }

    // --- 3) Decode with detected encoding ---
    const text = new TextDecoder(encoding, { fatal: false }).decode(buf);

    // --- 4) Remove BOM leftovers and NULL bytes ---
    return text.replace(/\uFEFF/g, "").replace(/\0/g, "");
  }

  stripHtmlToText(html) {
    // Quick & safe HTML->text for Step Details tables/blocks
    const s = String(html || "");
    // Remove scripts/styles
    const noScripts = s.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "");
    // Replace <br> and </p> with newlines
    const withNl = noScripts.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n");
    // Remove tags
    let text = withNl.replace(/<[^>]+>/g, " ");

    // Decode HTML entities properly using browser DOM API
    try {
      const textarea = document.createElement("textarea");
      textarea.innerHTML = text;
      text = textarea.value || textarea.textContent || text;
    } catch (e) {
      // Fallback: manual entity decoding if DOM API fails
      text = text
        // Decode numeric entities first (e.g., &#123; or &#x1F;)
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
        // Then decode named entities (order matters: &amp; must be last)
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&"); // Must be last to avoid double-decoding
    }

    // Clean up: remove standalone & that are not part of entities (likely artifacts)
    // This fixes cases like "&N&G&P" or "&N&G&P&V&H&O&S&T&" which should be "NGPVHOST"
    // More aggressive pattern: remove all "&" symbols that are followed by a single character and space/&/end
    text = text
      // First pass: remove patterns like "&N&", "&G&", "&P&" etc. (character surrounded by &)
      .replace(/&([A-Za-z0-9_])\s*&/g, "$1")
      // Second pass: remove "&" before alphanumeric characters (start or after space)
      .replace(/(^|\s)&([A-Za-z0-9_])/g, "$1$2")
      // Third pass: remove "&" after alphanumeric characters (before space or end)
      .replace(/([A-Za-z0-9_])\s*&(\s|$)/g, "$1$2")
      // Fourth pass: remove standalone "&" surrounded by spaces
      .replace(/\s+&\s+/g, " ")
      // Clean up whitespace (but preserve single spaces between words)
      .replace(/\s+\n/g, "\n")
      .replace(/\n\s+/g, "\n")
      .replace(/[ \t]{2,}/g, " ") // Replace multiple spaces/tabs with single space
      .trim();

    // Don't use normalizeText here to preserve spaces in Step Details text
    // Just decode JSON escape sequences and remove NULL bytes/BOM
    text = text
      .replace(/\\"/g, '"')  // \" -> "
      .replace(/\\n/g, "\n") // \n -> newline
      .replace(/\\t/g, "\t") // \t -> tab
      .replace(/\\\\/g, "\\") // \\ -> \
      .replace(/\0/g, "") // Remove NULL bytes
      .replace(/\uFEFF/g, ""); // Remove BOM

    return text;
  }

  normalizeText(input) {
    // Fix weird spacing/encoding artifacts + normalize unicode
    // This helps with strings like "NGPVHOST_..._trace" and prevents accidental split-like rendering.
    let str = String(input ?? "");

    // Remove null bytes, BOM, and control characters
    // Use character code checking to avoid linter issues with control chars in regex
    str = str.replace(/./g, (char) => {
      const code = char.charCodeAt(0);
      // Remove NULL bytes (0x00) and BOM (0xFEFF)
      if (code === 0x00 || code === 0xFEFF) {
        return "";
      }
      // Replace control characters (0x01-0x1F, 0x7F) with space, keep space/tab
      if ((code >= 0x01 && code <= 0x1F) || code === 0x7F) {
        return " ";
      }
      // Keep all other characters
      return char;
    });

    // First, fix HTML entities artifacts like "&N&G&P&V&H&O&S&T&" -> "NGPVHOST"
    // This pattern appears when HTML entities are partially decoded or malformed
    // Apply multiple passes to handle various patterns
    for (let i = 0; i < 5; i++) {
      // Stop if no more "&" patterns found
      const before = str;
      str = str
        // Remove patterns like "&N&", "&G&", "&P&" (character surrounded by &)
        .replace(/&([A-Za-z0-9_])&/g, "$1")
        // Remove "&" before alphanumeric characters (start or after space/&)
        .replace(/(^|\s|&)&([A-Za-z0-9_])/g, "$1$2")
        // Remove "&" after alphanumeric characters (before space/&/end)
        .replace(/([A-Za-z0-9_])&(\s|&|$)/g, "$1$2")
        // Remove standalone "&" surrounded by spaces
        .replace(/\s+&\s+/g, " ");
      // If no changes, stop iterating
      if (str === before) {
        break;
      }
    }

    // Fix encoding issues: replace problematic Unicode characters that jsPDF can't render
    // This fixes issues like "Ø=Ü÷" or spaced-out text "N G P V H O S T"
    // Try to detect and fix encoding problems
    str = str
      // Fix broken Unicode sequences that appear as single characters with spaces
      // This fixes "NGPVHOS T _ 8 b e 7 7" -> "NGPVHOST_8be77"
      // BUT preserve spaces in duration format like "49s 306ms"
      .replace(/([A-Za-z0-9_])\s+(?=[A-Za-z0-9_])/g, (match, p1, offset, fullStr) => {
        // Don't remove space if it's part of duration format: "Xs Yms" or "Xms Ys"
        const before = fullStr.substring(Math.max(0, offset - 10), offset);
        const after = fullStr.substring(offset, Math.min(fullStr.length, offset + 10));
        // Check if this is a duration format pattern (number + unit + space + number + unit)
        if (/\d+[sm]?\s+\d+[ms]?/i.test(before + after)) {
          return match; // Keep the space
        }
        return p1; // Remove the space
      })
      // More aggressive: remove spaces between alphanumeric characters in sequences
      // BUT preserve spaces in duration format like "49s 306ms"
      .replace(/([A-Za-z0-9])\s+([A-Za-z0-9])/g, (match, p1, p2, offset, fullStr) => {
        // Don't remove space if it's part of duration format: "Xs Yms" or "Xms Ys"
        const before = fullStr.substring(Math.max(0, offset - 10), offset);
        const after = fullStr.substring(offset + match.length, Math.min(fullStr.length, offset + match.length + 10));
        // Check if this is a duration format pattern (number + unit + space + number + unit)
        if (/\d+[sm]?\s+\d+[ms]?/i.test(before + match + after)) {
          return match; // Keep the space
        }
        return p1 + p2; // Remove the space
      })
      // Remove zero-width spaces and other invisible Unicode characters
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      // Replace common broken Unicode characters with their ASCII equivalents
      .replace(/Ø/g, "O")
      .replace(/Ü/g, "U")
      .replace(/÷/g, "/")
      .replace(/[^\u0020-\u007E]/g, (char) => {
        // For non-ASCII characters, try to normalize
        try {
          const normalized = char.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          // If normalization doesn't help, replace with closest ASCII equivalent
          const asciiRange = /[\u0020-\u007E]/;
          if (!asciiRange.test(normalized)) {
            return ""; // Remove if still non-ASCII after normalization
          }
          return normalized;
        } catch (e) {
          return ""; // Remove on error
        }
      });

    // Normalize Unicode (NFKC is best for compatibility)
    try {
      str = str.normalize("NFKC");
    } catch (e) {
      // If normalization fails, continue with the string as-is
    }

    // Clean up whitespace
    str = str.replace(/\s+/g, " ").trim();

    return str;
  }

  getDurationMs(timeObj, fallbackDuration) {
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

  formatDurationMs(ms) {
    const total = Math.max(0, Math.floor(Number(ms) || 0));
    const seconds = Math.floor(total / 1000);
    const milliseconds = total % 1000;

    // Format: "49s 306ms" (with space between seconds and milliseconds)
    if (milliseconds === 0) {
      return `${seconds}s`;
    }
    return `${seconds}s ${milliseconds}ms`;
  }

  formatShortDuration(ms) {
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

  getStatusColor(status) {
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

  isImageAttachment(attachment) {
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

  async addImageToPdf(pdf, imageUrl, attachment, x, yPos, pageWidth, pageHeight) {
    return new Promise((resolve) => {
      try {
        const maxImageHeight = 110;
        if (yPos + maxImageHeight > pageHeight - 16) {
          pdf.addPage();
          this.setupUnicodeFont(pdf);
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

            // label
        pdf.setFontSize(8);
            pdf.setTextColor(110, 110, 110);
            const imageName = this.normalizeText(attachment?.name || attachment?.source || "Screenshot");
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
              // jsPDF webp support may vary; skip safely
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

  translate(key, defaultValue) {
    return this.options.translate ? this.options.translate(key, defaultValue) : defaultValue;
  }
}

export default PdfView;
