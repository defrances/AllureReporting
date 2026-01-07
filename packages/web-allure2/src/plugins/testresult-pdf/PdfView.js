import { View } from "backbone.marionette";
import $ from "jquery";
import { reportDataUrl } from "@allurereport/web-commons";
import { className, on } from "@/decorators/index.js";
import translate from "@/helpers/t.js";
import attachmentType from "@/utils/attachmentType.js";
import template from "./PdfView.hbs";
import "./styles.scss";

async function loadPdfLibraries() {
  const candidates = [
    () => import("jspdf/dist/jspdf.es.min.js"),
    () => import("jspdf/dist/jspdf.umd.min.js"),
    () => import("jspdf"),
  ];

  let lastError;

  for (const load of candidates) {
    try {
      const mod = await load();
      console.log("[PDF Generator] Module loaded:", {
        hasJsPDF: !!mod.jsPDF,
        hasDefault: !!mod.default,
        defaultType: typeof mod.default,
        keys: Object.keys(mod),
      });
      
      const jsPDF = mod.jsPDF || mod.default?.jsPDF || mod.default || mod;
      console.log("[PDF Generator] jsPDF extracted:", {
        type: typeof jsPDF,
        isConstructor: typeof jsPDF === "function",
        hasPrototype: !!jsPDF.prototype,
      });

      console.log("[PDF Generator] jsPDF loaded successfully (annotations are built-in in v4.0+)");
  return { jsPDF };
    } catch (e) {
      console.error("[PDF Generator] Error loading candidate:", e);
      lastError = e;
    }
  }

  throw lastError || new Error("Failed to load jsPDF with annotations support");
}

function safeTranslate(key, fallback) {
  try {
    return translate(key) || fallback;
  } catch {
    return fallback;
  }
}

function clampNumber(n, min, max) {
  const v = Number.isFinite(n) ? n : min;
  return Math.min(max, Math.max(min, v));
}

function sanitizeFileName(input) {
  const raw = String(input ?? "report");
  const cleaned = raw
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 120) || "report";
}

function detectImageFormatFromDataUrl(dataUrl) {
  if (typeof dataUrl !== "string") return null;
  const m = dataUrl.match(/^data:([^;]+);base64,/i);
  const mime = m?.[1]?.toLowerCase();
  if (!mime) return null;

  if (mime.includes("png")) return "PNG";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "JPEG";
  if (mime.includes("webp")) return "WEBP";
  // SVG is not reliably supported by jsPDF addImage without plugins; we rasterize it to PNG elsewhere.
  return null;
}

@className("test-result-pdf")
class PdfView extends View {
  template = template;

  colors = {
    primary: [41, 128, 185], // Blue
    success: [39, 174, 96], // Green
    danger: [231, 76, 60], // Red
    warning: [243, 156, 18], // Orange
    info: [52, 152, 219], // Light Blue
    dark: [44, 62, 80], // Dark Gray
    light: [236, 240, 241], // Light Gray
    border: [189, 195, 199], // Border Gray
    text: [44, 62, 80], // Text Dark
    textLight: [127, 140, 141], // Text Light
  };

  serializeData() {
    const model = this.model?.toJSON?.() || {};
    return {
      cls: this.className,
      testName: model.name || "Test",
      status: model.status || "unknown",
    };
  }

  getStatusColor(status) {
    const statusColors = {
      passed: this.colors.success,
      failed: this.colors.danger,
      broken: this.colors.warning,
      skipped: this.colors.textLight,
      unknown: this.colors.textLight,
    };
    return statusColors[status] || this.colors.textLight;
  }

  @on("click .pdf-download-button")
  async onDownloadPdf(e) {
    e.preventDefault();

    const button = $(e.currentTarget);
    const originalText = button.text();

    button.prop("disabled", true).text(
      safeTranslate("testResult.pdf.generating", "Generating PDF...")
    );
    
    try {
      console.log("[PDF Generator] Starting PDF generation with annotations support v3.0");
      const { jsPDF: jsPDFLib } = await loadPdfLibraries();
      console.log("[PDF Generator] jsPDF loaded successfully");

      const testData = this.model?.toJSON?.() || {};
      const allAttachments = Array.isArray(this.model?.allAttachments)
        ? this.model.allAttachments
        : [];

      const pdf = new jsPDFLib("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const layout = {
        margin: 20,
        headerHeight: 30,
        footerHeight: 20,
      };

      this.addCoverPage(pdf, testData, pageWidth, pageHeight, layout.margin);

      const sections = this.buildSectionsList(testData, allAttachments);
      const tocPages = this.createTocPages(pdf, pageHeight, layout, sections.length);

      const ctx = {
        pageWidth,
        pageHeight,
        ...layout,
        y: layout.margin + layout.headerHeight,
      };

      const startContentPage = () => {
          pdf.addPage();
        this.setupHeaderFooter(pdf, ctx.pageWidth, ctx.pageHeight, ctx.margin, ctx.headerHeight, ctx.footerHeight);
        ctx.y = ctx.margin + ctx.headerHeight;
      };

      const ensureSpace = (requiredHeight) => {
        const need = clampNumber(requiredHeight, 0, 10_000);
        if (ctx.y + need > ctx.pageHeight - ctx.footerHeight) {
          startContentPage();
          return true;
        }
        return false;
      };
      
      const sectionPositions = {};

      startContentPage();
      ctx.y = this.addSectionHeader(pdf, "Test Overview", ctx.pageWidth, ctx.y, ctx.margin, ensureSpace);
      sectionPositions["Test Overview"] = {
        page: pdf.internal.getCurrentPageInfo().pageNumber,
        top: ctx.y,
      };
      ctx.y = this.addTestOverview(pdf, testData, ctx.pageWidth, ctx.y, ctx.margin, ensureSpace);

      startContentPage();
      ctx.y = this.addSectionHeader(pdf, "Environment", ctx.pageWidth, ctx.y, ctx.margin, ensureSpace);
      sectionPositions["Environment"] = {
        page: pdf.internal.getCurrentPageInfo().pageNumber,
        top: ctx.y,
      };
      ctx.y = await this.addEnvironmentSection(pdf, testData, ctx.pageWidth, ctx.y, ctx.margin, ensureSpace);

      if (Array.isArray(testData.labels) && testData.labels.length > 0) {
        const sectionName = safeTranslate("testResult.tags.name", "Tags");
        startContentPage();
        ctx.y = this.addSectionHeader(pdf, sectionName, ctx.pageWidth, ctx.y, ctx.margin, ensureSpace);
        sectionPositions[sectionName] = {
          page: pdf.internal.getCurrentPageInfo().pageNumber,
          top: ctx.y,
        };
        ctx.y = this.addLabelsSection(pdf, testData.labels, ctx.pageWidth, ctx.y, ctx.margin, ensureSpace);
      }

      if (Array.isArray(testData.parameters) && testData.parameters.length > 0) {
        const sectionName = safeTranslate("testResult.parameters.name", "Parameters");
        startContentPage();
        ctx.y = this.addSectionHeader(pdf, sectionName, ctx.pageWidth, ctx.y, ctx.margin, ensureSpace);
        sectionPositions[sectionName] = {
          page: pdf.internal.getCurrentPageInfo().pageNumber,
          top: ctx.y,
        };
        ctx.y = this.addParametersSection(pdf, testData.parameters, ctx.pageWidth, ctx.y, ctx.margin, ensureSpace);
      }

      if (Array.isArray(testData.links) && testData.links.length > 0) {
        const sectionName = safeTranslate("testResult.links.name", "Links");
        startContentPage();
        ctx.y = this.addSectionHeader(pdf, sectionName, ctx.pageWidth, ctx.y, ctx.margin, ensureSpace);
        sectionPositions[sectionName] = {
          page: pdf.internal.getCurrentPageInfo().pageNumber,
          top: ctx.y,
        };
        ctx.y = this.addLinksSection(pdf, testData.links, ctx.pageWidth, ctx.y, ctx.margin, ensureSpace);
      }

      if (testData.description) {
        const sectionName = safeTranslate("testResult.description.name", "Description");
        startContentPage();
        ctx.y = this.addSectionHeader(pdf, sectionName, ctx.pageWidth, ctx.y, ctx.margin, ensureSpace);
        sectionPositions[sectionName] = {
          page: pdf.internal.getCurrentPageInfo().pageNumber,
          top: ctx.y,
        };
        ctx.y = this.addDescriptionSection(pdf, String(testData.description), ctx.pageWidth, ctx.y, ctx.margin, ensureSpace);
      }

      if (testData.testStage?.steps && Array.isArray(testData.testStage.steps)) {
        const sectionName = safeTranslate("testResult.execution.name", "Execution");
        startContentPage();
        ctx.y = this.addSectionHeader(pdf, sectionName, ctx.pageWidth, ctx.y, ctx.margin, ensureSpace);
        sectionPositions[sectionName] = {
          page: pdf.internal.getCurrentPageInfo().pageNumber,
          top: ctx.y,
        };
        ctx.y = this.addStepsToPdf(
          pdf,
          testData.testStage.steps,
          ctx.margin,
          ctx.y,
          ctx.pageWidth,
          ctx.pageHeight,
          ensureSpace
        );
      }

      if ((testData.status === "failed" || testData.status === "broken") && testData.statusDetails) {
        const sectionName = "Status Details";
        startContentPage();
        ctx.y = this.addSectionHeader(pdf, sectionName, ctx.pageWidth, ctx.y, ctx.margin, ensureSpace);
        sectionPositions[sectionName] = {
          page: pdf.internal.getCurrentPageInfo().pageNumber,
          top: ctx.y,
        };
        ctx.y = this.addStatusDetailsSection(
          pdf,
          testData.statusDetails,
          ctx.pageWidth,
          ctx.y,
          ctx.margin,
          ensureSpace
        );
      }

      if (allAttachments.length > 0) {
        const sectionName = "Attachments";
        startContentPage();
        ctx.y = this.addSectionHeader(pdf, sectionName, ctx.pageWidth, ctx.y, ctx.margin, ensureSpace);
        sectionPositions[sectionName] = {
          page: pdf.internal.getCurrentPageInfo().pageNumber,
          top: ctx.y,
        };
        ctx.y = await this.addAttachmentsSection(
          pdf,
          allAttachments,
          ctx.pageWidth,
          ctx.pageHeight,
          ctx.y,
          ctx.margin,
          ensureSpace
        );
      }

      this.fillTocPages(pdf, tocPages, sections, testData, allAttachments, pageWidth, pageHeight, layout, sectionPositions);
      const safeId = sanitizeFileName(testData.uid || testData.name || "report");
      const fileName = `test-${safeId}.pdf`;
      pdf.save(fileName);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[PDF Generator] Error generating PDF:", error);
      console.error("[PDF Generator] Error stack:", error?.stack);
      console.error("[PDF Generator] Error message:", error?.message);
      console.error("[PDF Generator] Error details:", {
        name: error?.name,
        message: error?.message,
        stack: error?.stack,
        toString: String(error),
      });
      alert(safeTranslate("testResult.pdf.error", "Error generating PDF. Please try again."));
    } finally {
      button.prop("disabled", false).text(originalText);
    }
  }

  buildSectionsList(testData, allAttachments) {
    return [
      "Test Overview",
      "Environment",
      Array.isArray(testData.labels) && testData.labels.length > 0
        ? safeTranslate("testResult.tags.name", "Tags")
        : null,
      Array.isArray(testData.parameters) && testData.parameters.length > 0
        ? safeTranslate("testResult.parameters.name", "Parameters")
        : null,
      Array.isArray(testData.links) && testData.links.length > 0
        ? safeTranslate("testResult.links.name", "Links")
        : null,
      testData.description ? safeTranslate("testResult.description.name", "Description") : null,
      Array.isArray(testData.testStage?.steps) && testData.testStage.steps.length > 0
        ? safeTranslate("testResult.execution.name", "Execution")
        : null,
      (testData.status === "failed" || testData.status === "broken") && testData.statusDetails
        ? "Status Details"
        : null,
      Array.isArray(allAttachments) && allAttachments.length > 0 ? "Attachments" : null,
    ].filter(Boolean);
  }

  createTocPages(pdf, pageHeight, layout, sectionCount) {
    const { margin, headerHeight, footerHeight } = layout;

    const titleBlock = 30;
    const perItem = 18;
    const usable = pageHeight - footerHeight - (margin + headerHeight);

    const neededHeight = titleBlock + sectionCount * perItem + 10;
    const pagesNeeded = Math.max(1, Math.ceil(neededHeight / usable));

    const tocPages = [];
    for (let i = 0; i < pagesNeeded; i++) {
      pdf.addPage();
      tocPages.push(pdf.internal.getCurrentPageInfo().pageNumber);
    }
    return tocPages;
  }

  fillTocPages(pdf, tocPages, sections, testData, allAttachments, pageWidth, pageHeight, layout, sectionPositions) {
    const { margin, headerHeight, footerHeight } = layout;

    let pageIndex = 0;
    let yPos = margin + headerHeight;

    const setTocPage = (idx) => {
      const pageNum = tocPages[idx];
      pdf.setPage(pageNum);
      this.setupHeaderFooter(pdf, pageWidth, pageHeight, margin, headerHeight, footerHeight);
      yPos = margin + headerHeight;
    };

    const ensureTocSpace = (h) => {
      const required = clampNumber(h, 0, 10_000);
      if (yPos + required > pageHeight - footerHeight) {
        pageIndex += 1;
        if (pageIndex >= tocPages.length) {
          return false;
        }
        setTocPage(pageIndex);
      }
      return true;
    };

    setTocPage(0);

      pdf.setFontSize(18);
      pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...this.colors.primary);
    pdf.text("Table of Contents", pageWidth / 2, yPos, { align: "center" });
    yPos += 20;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(11);

    const itemHeight = 10;
    const itemGap = 3;

    const canLink =
      typeof pdf.textWithLink === "function" ||
      typeof pdf.link === "function";
    
    console.log(`[PDF TOC] Link support check: textWithLink=${typeof pdf.textWithLink === "function"}, link=${typeof pdf.link === "function"}, canLink=${canLink}`);

    sections.forEach((section, idx) => {
      if (!ensureTocSpace(itemHeight + itemGap + 2)) {
        return;
      }

      const numberText = `${idx + 1}.`;
      const fullText = `${numberText} ${section}`;

      const textX = margin + 15;
      const pos = sectionPositions[section];

      pdf.setTextColor(...this.colors.primary);

      if (pos && canLink) {
        try {
          if (typeof pdf.textWithLink === "function") {
            pdf.textWithLink(fullText, textX, yPos, {
              pageNumber: pos.page,
              top: Math.max(0, pos.top - 8),
            });
            console.log(`[PDF TOC] ✓ Link created for "${section}"`);
          } else if (typeof pdf.link === "function") {
            const textWidth = pdf.getTextWidth(fullText);
            pdf.text(fullText, textX, yPos, { align: "left" });
            pdf.link(textX, yPos - 5, textWidth, itemHeight, {
              pageNumber: pos.page,
              top: Math.max(0, pos.top - 8),
            });
            console.log(`[PDF TOC] ✓ Link created for "${section}"`);
          } else {
            console.log(`[PDF TOC] ✗ No link support for "${section}"`);
            pdf.text(fullText, textX, yPos, { align: "left" });
          }
        } catch (error) {
          console.error(`[PDF TOC] ✗ Error creating link for "${section}":`, error);
          pdf.text(fullText, textX, yPos, { align: "left" });
        }
      } else {
        pdf.text(fullText, textX, yPos, { align: "left" });
      }

      pdf.setTextColor(...this.colors.text);
      yPos += itemHeight + itemGap;
    });
  }

  setupHeaderFooter(pdf, pageWidth, pageHeight, margin, headerHeight, footerHeight) {
    const pageNum = pdf.internal.getCurrentPageInfo().pageNumber;

    pdf.setDrawColor(...this.colors.border);
    pdf.setLineWidth(0.5);
    pdf.line(margin, headerHeight, pageWidth - margin, headerHeight);

    pdf.setFontSize(10);
    pdf.setTextColor(...this.colors.textLight);
    pdf.setFont("helvetica", "normal");
    pdf.text("Allure Test Report", margin, headerHeight - 5);

    pdf.setDrawColor(...this.colors.border);
    pdf.setLineWidth(0.5);
    pdf.line(margin, pageHeight - footerHeight, pageWidth - margin, pageHeight - footerHeight);

    pdf.setFontSize(9);
    pdf.setTextColor(...this.colors.textLight);
    pdf.text(`Page ${pageNum}`, pageWidth / 2, pageHeight - footerHeight + 5, { align: "center" });

    const d = new Date();
    const isoDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    pdf.text(isoDate, pageWidth - margin, pageHeight - footerHeight + 5, { align: "right" });
  }

  addCoverPage(pdf, testData, pageWidth, pageHeight, margin) {
    let yPos = pageHeight / 3;

    pdf.setFontSize(24);
      pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...this.colors.primary);
    pdf.text("Allure Test Report", pageWidth / 2, yPos, { align: "center" });
    yPos += 15;

    pdf.setFontSize(16);
    pdf.setTextColor(...this.colors.text);
    const testName = String(testData.name || "Test");
      const testNameLines = pdf.splitTextToSize(testName, pageWidth - 2 * margin);
      testNameLines.forEach((line) => {
      pdf.text(line, pageWidth / 2, yPos, { align: "center" });
      yPos += 8;
    });

    yPos += 20;

    const status = String(testData.status || "unknown").toUpperCase();
    const statusColor = this.getStatusColor(testData.status);
    pdf.setFillColor(...statusColor);
    pdf.setDrawColor(...statusColor);
    pdf.rect(pageWidth / 2 - 20, yPos - 5, 40, 10, "FD");

    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(12);
    pdf.setFont("helvetica", "bold");
    pdf.text(status, pageWidth / 2, yPos, { align: "center" });

    yPos += 30;

    pdf.setTextColor(...this.colors.text);
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "normal");
      
    const infoItems = [
      { label: "Duration", value: this.formatDuration(testData.duration || 0) },
      { label: "Severity", value: testData.severity || "normal" },
      { label: "Full Name", value: testData.fullName || "N/A" },
    ];

    infoItems.forEach((item) => {
        pdf.setFont("helvetica", "bold");
      pdf.text(`${item.label}:`, pageWidth / 2 - 30, yPos, { align: "right" });
        pdf.setFont("helvetica", "normal");
      pdf.text(String(item.value ?? "N/A"), pageWidth / 2 + 5, yPos);
      yPos += 7;
    });
  }

  addSectionHeader(pdf, title, pageWidth, yPos, margin, ensureSpace) {
    ensureSpace(15);

    pdf.setFillColor(...this.colors.primary);
    pdf.rect(margin, yPos - 8, pageWidth - 2 * margin, 10, "F");

    pdf.setFontSize(12);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(255, 255, 255);
    pdf.text(String(title), margin + 5, yPos);

    return yPos + 12;
  }

  addTestOverview(pdf, testData, pageWidth, yPos, margin, ensureSpace) {
    const tableData = [
      { label: "Duration", value: this.formatDuration(testData.duration || 0) },
      { label: "Severity", value: testData.severity || "normal" },
      { label: "Full Name", value: testData.fullName || "N/A" },
      { label: "Test ID", value: testData.uid || "N/A" },
      { label: "History ID", value: testData.historyId || "N/A" },
    ];
    return this.addTable(pdf, tableData, pageWidth, yPos, margin, ensureSpace);
  }

  async addEnvironmentSection(pdf, testData, pageWidth, yPos, margin, ensureSpace) {
    const envMap = new Map();

    const fetchEnvData = async (url) => {
      try {
        const envUrl = await reportDataUrl(url, "application/json");
        const response = await fetch(envUrl).catch(() => null);
        if (!response || !response.ok) return;

        const envItems = await response.json().catch(() => null);
        if (!Array.isArray(envItems)) return;

        envItems.forEach((item) => {
          if (!item?.name) return;
          const values = item.values;
          if (!values || (Array.isArray(values) && values.length === 0)) return;

          const value = Array.isArray(values) ? values.join(", ") : String(values);
          envMap.set(String(item.name).toLowerCase(), { name: item.name, value });
        });
      } catch {
      }
    };

    await Promise.allSettled([
      fetchEnvData("widgets/allure_environment.json"),
      fetchEnvData("widgets/environment.json"),
    ]);

    if (testData?.time?.start) {
      const startTime = new Date(testData.time.start);
      const formattedTime = startTime.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "Z");
      envMap.set("execution.time", { name: "execution.time", value: formattedTime });
    }

    if (testData.duration !== undefined && testData.duration !== null) {
      envMap.set("duration", { name: "duration", value: this.formatDuration(testData.duration) });
    }

    if (Array.isArray(testData.labels)) {
      const labelMapping = {
        environment: "environment",
        host: "computer.name",
        os: "operating.system",
        "os.name": "operating.system",
        language: "language",
        username: "username",
        user: "username",
        screen: "screen.dimension",
        "screen.dimension": "screen.dimension",
        "run.configuration": "run.configuration.name",
        "run.configuration.name": "run.configuration.name",
        mechsimdir: "mechSimDir",
        hostappdir: "hostAppDir",
      };

      testData.labels.forEach((label) => {
        const labelName = String(label?.name || "").toLowerCase();
        const labelValue = label?.value ?? "N/A";
        const envFieldName = labelMapping[labelName] || label?.name;

        if (!envFieldName) return;

        const key = String(envFieldName).toLowerCase();
        if (!envMap.has(key)) {
          envMap.set(key, { name: envFieldName, value: String(labelValue) });
        }
      });
    }

    if (testData.hostId && !envMap.has("computer.name")) {
      envMap.set("computer.name", { name: "computer.name", value: String(testData.hostId) });
    }
    if (testData.hostId && !envMap.has("host.id")) {
      envMap.set("host.id", { name: "Host ID", value: String(testData.hostId) });
    }
    if (testData.threadId && !envMap.has("thread.id")) {
      envMap.set("thread.id", { name: "Thread ID", value: String(testData.threadId) });
    }

    const envData = Array.from(envMap.values()).sort((a, b) => {
      if (a.name === "execution.time") return -1;
      if (b.name === "execution.time") return 1;
      return String(a.name).localeCompare(String(b.name));
    });

    if (envData.length === 0) {
      pdf.setFontSize(10);
      pdf.setTextColor(...this.colors.textLight);
      pdf.setFont("helvetica", "normal");
      pdf.text("No environment information available", margin + 5, yPos);
      return yPos + 8;
    }

    return this.addTable(pdf, envData, pageWidth, yPos, margin, ensureSpace);
  }

  addLabelsSection(pdf, labels, pageWidth, yPos, margin, ensureSpace) {
    const labelData = labels.map((label) => ({
      label: label?.name || "N/A",
      value: label?.value || "N/A",
    }));
    return this.addTable(pdf, labelData, pageWidth, yPos, margin, ensureSpace);
  }

  addParametersSection(pdf, parameters, pageWidth, yPos, margin, ensureSpace) {
    const paramData = parameters.map((param) => ({
      label: param?.name || "N/A",
      value: String(param?.value ?? "N/A"),
    }));
    return this.addTable(pdf, paramData, pageWidth, yPos, margin, ensureSpace);
  }

  addLinksSection(pdf, links, pageWidth, yPos, margin, ensureSpace) {
    const linkData = links.map((link) => ({
      label: link?.name || link?.type || "Link",
      value: link?.url || "N/A",
    }));
    return this.addTable(pdf, linkData, pageWidth, yPos, margin, ensureSpace);
  }

  addDescriptionSection(pdf, description, pageWidth, yPos, margin, ensureSpace) {
    pdf.setFontSize(10);
    pdf.setTextColor(...this.colors.text);
        pdf.setFont("helvetica", "normal");
        
    const descLines = pdf.splitTextToSize(String(description), pageWidth - 2 * margin - 10);
    descLines.forEach((line) => {
      ensureSpace(6);
      pdf.text(line, margin + 5, yPos);
      yPos += 6;
    });

    return yPos + 5;
  }

  addStatusDetailsSection(pdf, statusDetails, pageWidth, yPos, margin, ensureSpace) {
    pdf.setFontSize(10);
    pdf.setTextColor(...this.colors.text);

    if (statusDetails?.message) {
        pdf.setFont("helvetica", "bold");
      pdf.text("Message:", margin + 5, yPos);
      yPos += 7;

        pdf.setFont("helvetica", "normal");
      pdf.setTextColor(...this.colors.danger);
        
      const messageLines = pdf.splitTextToSize(String(statusDetails.message), pageWidth - 2 * margin - 10);
          messageLines.forEach((line) => {
        ensureSpace(6);
        pdf.text(line, margin + 5, yPos);
        yPos += 6;
      });

      yPos += 5;
      pdf.setTextColor(...this.colors.text);
    }

    if (statusDetails?.trace) {
          pdf.setFont("helvetica", "bold");
      pdf.setTextColor(...this.colors.text);
      pdf.text("Stack Trace:", margin + 5, yPos);
      yPos += 7;

          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(8);
      pdf.setTextColor(...this.colors.textLight);

      const traceLines = pdf.splitTextToSize(String(statusDetails.trace), pageWidth - 2 * margin - 10);
          traceLines.forEach((line) => {
        ensureSpace(5);
        pdf.text(line, margin + 5, yPos);
        yPos += 5;
      });

          pdf.setFontSize(10);
      pdf.setTextColor(...this.colors.text);
    }

    return yPos;
  }

  async addAttachmentsSection(pdf, allAttachments, pageWidth, pageHeight, yPos, margin, ensureSpace) {
        const imageAttachments = [];
        const otherAttachments = [];
        
        for (const attachment of allAttachments) {
      const info = attachmentType(attachment?.type);
      if (info?.type === "image" || info?.type === "svg") imageAttachments.push(attachment);
      else otherAttachments.push(attachment);
    }

    if (otherAttachments.length > 0) {
      const attachmentData = otherAttachments.map((att) => ({
        label: att?.name || att?.source || "Attachment",
        value: att?.type || "unknown",
      }));
      yPos = this.addTable(pdf, attachmentData, pageWidth, yPos, margin, ensureSpace);
    }

        if (imageAttachments.length > 0) {
          for (const attachment of imageAttachments) {
            try {
          const mime = String(attachment?.type || "").toLowerCase();
          const isSvg = mime.includes("svg");

          const imageUrl = await reportDataUrl(`data/attachments/${attachment.source}`, attachment.type);

          const imgData = isSvg
            ? await this.loadSvgAsPngDataUrl(imageUrl)
            : await this.loadImageAsDataUrl(imageUrl);

          if (!imgData || typeof imgData !== "string") {
            throw new Error("Failed to load image data");
          }

          const format = detectImageFormatFromDataUrl(imgData) || "PNG";

              const maxWidth = pageWidth - 2 * margin;
          const maxHeight = pageHeight - yPos - 30;
              
          const { width: pxW, height: pxH } = await this.getImageDimensions(imgData);
              
              const pxToMm = 0.264583;
          let imgWidth = pxW * pxToMm;
          let imgHeight = pxH * pxToMm;
              
              if (imgWidth > maxWidth) {
            const r = maxWidth / imgWidth;
                imgWidth = maxWidth;
            imgHeight *= r;
              }
              if (imgHeight > maxHeight) {
            const r = maxHeight / imgHeight;
                imgHeight = maxHeight;
            imgWidth *= r;
          }

          ensureSpace(imgHeight + 15);

          pdf.setFontSize(9);
          pdf.setTextColor(...this.colors.text);
              pdf.setFont("helvetica", "normal");

          const imageName = attachment?.name || attachment?.source || "Image";
          const nameLines = pdf.splitTextToSize(String(imageName), maxWidth);
              nameLines.forEach((line) => {
            ensureSpace(5);
            pdf.text(line, margin + 5, yPos);
            yPos += 5;
          });

          yPos += 2;

          pdf.addImage(imgData, format, margin + 5, yPos, imgWidth, imgHeight);
          yPos += imgHeight + 5;
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(`Error loading image attachment: ${attachment?.source}`, err);
          ensureSpace(7);
          pdf.setFontSize(10);
          pdf.setTextColor(...this.colors.textLight);
              pdf.setFont("helvetica", "normal");
          pdf.text(`- ${attachment?.name || attachment?.source || "image"} (failed to load)`, margin + 5, yPos);
          yPos += 7;
        }
      }
    }

    return yPos;
  }

  addTable(pdf, data, pageWidth, yPos, margin, ensureSpace, rowFormatter = null) {
    const col1Width = (pageWidth - 2 * margin) * 0.35;
    const col2Width = (pageWidth - 2 * margin) * 0.65;
    const rowHeight = 8;
    const headerHeight = 8;

    ensureSpace(headerHeight + 2);

    const headerColor = [52, 73, 94];
    pdf.setFillColor(...headerColor);
    pdf.rect(margin, yPos - headerHeight / 2, pageWidth - 2 * margin, headerHeight, "F");

    pdf.setFontSize(10);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(255, 255, 255);
    pdf.text("Name", margin + 5, yPos);
    pdf.text("Value", margin + col1Width + 5, yPos);
    yPos += headerHeight + 1;

    data.forEach((row, index) => {
      const labelText = String(row?.label ?? row?.name ?? "N/A");
      const valueText = String(row?.value ?? "N/A");

      const labelLines = pdf.splitTextToSize(labelText, col1Width - 10);
      const valueLines = pdf.splitTextToSize(valueText, col2Width - 10);
      const maxLines = Math.max(labelLines.length, valueLines.length);
      const currentRowHeight = Math.max(maxLines * 5, rowHeight);

      ensureSpace(currentRowHeight + 2);

      if (rowFormatter) {
        rowFormatter(row, index);
      } else {
        pdf.setFillColor(245, 245, 245);
        pdf.rect(margin, yPos - currentRowHeight / 2, pageWidth - 2 * margin, currentRowHeight, "F");

        pdf.setTextColor(...this.colors.text);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(10);
      }

      pdf.setDrawColor(...this.colors.border);
      pdf.setLineWidth(0.2);
      pdf.line(margin, yPos - currentRowHeight / 2, pageWidth - margin, yPos - currentRowHeight / 2);

      for (let i = 0; i < maxLines; i++) {
        const textY = yPos + i * 5 - currentRowHeight / 2 + 5;
        if (i < labelLines.length) pdf.text(labelLines[i], margin + 5, textY);
        if (i < valueLines.length) pdf.text(valueLines[i], margin + col1Width + 5, textY);
      }

      yPos += currentRowHeight + 1;
    });

    pdf.setDrawColor(0, 0, 0);
    pdf.setLineWidth(0.5);
    pdf.line(margin, yPos - 1, pageWidth - margin, yPos - 1);

    return yPos + 5;
  }

  addStepsToPdf(pdf, steps, margin, startY, pageWidth, pageHeight, ensureSpace) {
    let yPos = startY;

    const addStep = (step, indent = 0) => {
      ensureSpace(8);

      const indentSize = indent * 8;
      const stepWidth = pageWidth - 2 * margin - indentSize - 10;

      const status = step?.status || "unknown";
      const statusColor = this.getStatusColor(status);
      pdf.setFillColor(...statusColor);
      pdf.circle(margin + indentSize + 3, yPos - 2, 2, "F");

      pdf.setFontSize(9);
      pdf.setTextColor(...this.colors.text);
      pdf.setFont("helvetica", "normal");

      const stepText = String(step?.name || "Step");
      const stepLines = pdf.splitTextToSize(stepText, stepWidth);
      stepLines.forEach((line, idx) => {
        if (idx > 0) ensureSpace(6);
        pdf.text(line, margin + indentSize + 10, yPos);
        yPos += 6;
      });

      if (step?.duration) {
        pdf.setFontSize(8);
        pdf.setTextColor(...this.colors.textLight);
        pdf.text(`(${this.formatDuration(step.duration)})`, margin + indentSize + 10, yPos);
        yPos += 5;
      }

      if (Array.isArray(step?.parameters) && step.parameters.length > 0) {
        yPos += 2;
        step.parameters.forEach((param) => {
          ensureSpace(5);
          pdf.setFontSize(8);
          pdf.setTextColor(...this.colors.textLight);
          pdf.text(
            `  • ${param?.name || "param"}: ${param?.value ?? "N/A"}`,
            margin + indentSize + 15,
            yPos
          );
          yPos += 5;
        });
      }

      yPos += 3;

      if (Array.isArray(step?.steps) && step.steps.length > 0) {
        step.steps.forEach((sub) => addStep(sub, indent + 1));
      }
    };

    steps.forEach((s) => addStep(s));
    return yPos;
  }
  
  formatDuration(duration) {
    const d = Number(duration);
    if (!Number.isFinite(d) || d < 0) return "0ms";
    if (d < 1000) return `${Math.round(d)}ms`;

    const seconds = Math.floor(d / 1000);
    const milliseconds = d % 1000;

    if (seconds < 60) {
      return `${seconds}.${String(Math.floor(milliseconds / 100)).padStart(1, "0")}s`;
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }

  async loadImageAsDataUrl(url) {
    const response = await fetch(url).catch(() => null);
    if (!response || !response.ok) {
      throw new Error(`Failed to fetch image: ${response?.status || "unknown"}`);
    }
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Failed to read image blob"));
      reader.readAsDataURL(blob);
    });
  }

  async loadSvgAsPngDataUrl(svgUrl) {
    const response = await fetch(svgUrl).catch(() => null);
    if (!response || !response.ok) {
      throw new Error(`Failed to fetch svg: ${response?.status || "unknown"}`);
    }
    const svgText = await response.text();

    const svgBlob = new Blob([svgText], { type: "image/svg+xml" });
    const objectUrl = URL.createObjectURL(svgBlob);

    try {
      const img = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Failed to load svg into Image"));
        image.src = objectUrl;
      });

      const canvas = document.createElement("canvas");
      canvas.width = img.width || 1200;
      canvas.height = img.height || 800;

      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas 2D context not available");

      ctx.drawImage(img, 0, 0);
      return canvas.toDataURL("image/png");
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  getImageDimensions(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.width, height: img.height });
      img.onerror = () => reject(new Error("Failed to read image dimensions"));
      img.src = dataUrl;
    });
  }
}

export default PdfView;