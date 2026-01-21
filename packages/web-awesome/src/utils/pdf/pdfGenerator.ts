import { jsPDF } from "jspdf";
import type { AwesomeTestResult } from "types";
import { reportDataUrl } from "@allurereport/web-commons";
import {
  MARGIN,
  FONT_SIZE_TITLE,
  FONT_SIZE_SECTION,
  FONT_SIZE_BODY,
  SPACING_SECTION,
} from "./pdfConstants";
import {
  setupUnicodeFont,
  getAllureBaseUrl,
  normalizeText,
  stripHtmlToText,
  formatDurationMs,
  formatShortDuration,
  getDurationMs,
  getStatusColor,
  isImageAttachment,
  addImageToPdf,
  fetchText,
} from "./pdfUtils";
import {
  addKeyValue,
  addKeyValueWithLink,
  addWrappedBlock,
  addStepsHeader,
  addStageTitle,
  getStepColumns,
} from "./pdfSections";

function safeInternalLink(pdf: any, x: number, y: number, w: number, h: number, pageNumber: number): void {
  const total = pdf.internal.getNumberOfPages();
  if (!Number.isFinite(pageNumber) || pageNumber < 1 || pageNumber > total) {
    console.warn("Invalid link target pageNumber:", pageNumber, "total:", total);
    return;
  }
  if (typeof pdf.link !== "function") {
    console.warn("pdf.link is not available. Annotations plugin may be missing.");
    return;
  }
  pdf.link(x, y, w, h, { pageNumber, top: 0, zoom: 0 });
}

export async function generateFullReportPdf(
  pdf: any,
  allTestResults: Array<{ testData?: AwesomeTestResult; uid?: string; name?: string; status?: string }>,
): Promise<void> {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = MARGIN;

  const testPages: Array<{ testIndex: number; pageStart: number; pageEnd: number }> = [];
  let currentPage = 1;
  let yPos = margin;

  const ensureSpace = (needed: number): boolean => {
    const h = Math.max(0, Math.min(10000, Number(needed) || 0));
    if (yPos + h > pageHeight - margin) {
      pdf.addPage();
      setupUnicodeFont(pdf);
      currentPage++;
      yPos = margin;
      return true;
    }
    return false;
  };

  const addPageNumber = (pageNum: number): void => {
    const totalPages = pdf.internal.getNumberOfPages();
    pdf.setFontSize(8);
    pdf.setTextColor(120, 120, 120);
    pdf.text(`Page ${pageNum} of ${totalPages}`, pageWidth / 2, pageHeight - 10, { align: "center" });
    pdf.setTextColor(0, 0, 0);
  };

  pdf.setPage(1);
  setupUnicodeFont(pdf);
  currentPage = 1;
  yPos = margin;

  const titlePageNum = currentPage;
  await addTitlePage(pdf, pageWidth, pageHeight);
  pdf.addPage();
  setupUnicodeFont(pdf);
  currentPage++;
  yPos = margin;

  const contentsPageNum = currentPage;
  const contentsData: Array<{
    testName: string;
    status: string;
    linkY: number;
    linkPage: number;
    linkTargetPage: number | null;
    textWidth: number;
    testIndex: number;
  }> = [];
  pdf.setPage(currentPage);
  yPos = margin;

  if (allTestResults.length === 0) {
    pdf.setFontSize(FONT_SIZE_TITLE);
    pdf.text("Contents", margin, yPos);
    yPos += 20;
    pdf.setFontSize(FONT_SIZE_BODY);
    pdf.text("No tests found", margin, yPos);
    pdf.addPage();
    setupUnicodeFont(pdf);
    currentPage++;
    yPos = margin;
  } else {
    setupUnicodeFont(pdf);
    pdf.setFontSize(FONT_SIZE_TITLE);
    pdf.text("Contents", margin, yPos);
    yPos += 20;

    setupUnicodeFont(pdf);
    pdf.setFontSize(10);
    pdf.text("Test Name", margin, yPos);
    pdf.text("Status", pageWidth - margin - 30, yPos, { align: "right" });
    yPos += 8;
    pdf.setDrawColor(200, 200, 200);
    pdf.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 5;

    pdf.setFontSize(9);
    for (let i = 0; i < allTestResults.length; i++) {
      const testResult = allTestResults[i];
      if (!testResult || !testResult.uid) {
        continue;
      }

      ensureSpace(8);
      setupUnicodeFont(pdf);
      const testName = String(testResult.name ?? `Test ${i + 1}`).slice(0, 80);
      const status = String(testResult.status ?? "unknown").toUpperCase();

      const linkY = yPos;
      const linkPage = currentPage;
      pdf.setTextColor(0, 0, 200);
      pdf.text(testName, margin, yPos);
      pdf.setTextColor(0, 0, 0);
      pdf.text(status, pageWidth - margin - 30, yPos, { align: "right" });

      const linkTargetPage = null;
      contentsData.push({
        testName,
        status,
        linkY,
        linkPage,
        linkTargetPage,
        textWidth: pdf.getTextWidth(testName),
        testIndex: i,
      });

      yPos += 7;
    }
  }

  pdf.addPage();
  setupUnicodeFont(pdf);
  currentPage++;
  pdf.setPage(currentPage);
  yPos = margin;
  const summaryPageNum = currentPage;

  yPos = addSummaryPage(pdf, allTestResults, pageWidth, pageHeight, margin, yPos, ensureSpace);
  pdf.addPage();
  setupUnicodeFont(pdf);
  currentPage++;
  yPos = margin;

  for (let i = 0; i < allTestResults.length; i++) {
    const testResult = allTestResults[i];
    if (!testResult || !testResult.uid) {
      continue;
    }

    try {
      const testData = testResult.testData ?? (testResult as any);
      const testPageStart = currentPage;
      pdf.setPage(currentPage);
      yPos = margin;

      await generateTestPdf(pdf, testData, {
        startNewPage: false,
        testNumber: null,
        showBackToContents: true,
        contentsPageNum,
        ensureSpace,
      });

      const contentsItem = contentsData.find((item) => item.testIndex === i);
      if (contentsItem) {
        contentsItem.linkTargetPage = testPageStart;
      }

      currentPage = pdf.internal.getNumberOfPages();
      testPages.push({ testIndex: i, pageStart: testPageStart, pageEnd: currentPage });

      if (i < allTestResults.length - 1) {
        pdf.addPage();
        setupUnicodeFont(pdf);
        currentPage++;
        yPos = margin;
      }
    } catch (error) {
      console.error(`Error generating PDF for test ${i + 1}:`, error);
      continue;
    }
  }

  pdf.setFontSize(9);
  setupUnicodeFont(pdf);

  for (const item of contentsData) {
    if (item.linkTargetPage && item.linkPage) {
      pdf.setPage(item.linkPage);
      setupUnicodeFont(pdf);
      pdf.setFontSize(9);
      const linkY = item.linkY;
      const textWidth = item.textWidth || pdf.getTextWidth(item.testName);
      const linkHeight = 8;
      const linkYTop = linkY - 5;
      const linkWidth = Math.max(textWidth, 50);

      safeInternalLink(pdf, margin, linkYTop, linkWidth, linkHeight, item.linkTargetPage);
    }
  }

  const finalPageCount = pdf.internal.getNumberOfPages();
  for (let pageNum = 1; pageNum <= finalPageCount; pageNum++) {
    pdf.setPage(pageNum);
    setupUnicodeFont(pdf);
    addPageNumber(pageNum);
  }

  if (pdf.outline) {
    const outline = pdf.outline;
    const root = outline.add(null, "Test Report", null);

    outline.add(root, "Title", { pageNumber: titlePageNum });
    outline.add(root, "Contents", { pageNumber: contentsPageNum });
    outline.add(root, "Summary", { pageNumber: summaryPageNum });

    const testsNode = outline.add(root, "Tests", null);

    for (const tp of testPages) {
      const testResult = allTestResults[tp.testIndex];
      if (!testResult) {
        continue;
      }

      const testName = String(testResult.name ?? `Test ${tp.testIndex + 1}`).slice(0, 50);
      outline.add(testsNode, `Test: ${testName}`, { pageNumber: tp.pageStart });
    }
  }

  pdf.setDisplayMode("original", "continuous", "UseOutlines");
}

const addTitlePage = async (pdf: any, pageWidth: number, pageHeight: number): Promise<void> => {
  setupUnicodeFont(pdf);
  const centerX = pageWidth / 2;
  const centerY = pageHeight / 2 - 20;

  pdf.setFontSize(24);
  pdf.text("Test Report", centerX, centerY, { align: "center" });

  pdf.setFontSize(12);
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toTimeString().slice(0, 8);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const timestamp = `${dateStr} ${timeStr} (${timezone})`;
  pdf.text(timestamp, centerX, centerY + 15, { align: "center" });
};

const addSummaryPage = (
  pdf: any,
  allTestResults: Array<{ testData?: AwesomeTestResult; uid?: string; name?: string; status?: string }>,
  pageWidth: number,
  pageHeight: number,
  margin: number,
  yPos: number,
  ensureSpace: (needed: number) => boolean,
): number => {
  setupUnicodeFont(pdf);
  pdf.setFontSize(FONT_SIZE_TITLE);
  pdf.text("Summary", margin, yPos);
  yPos += 20;

  if (allTestResults.length === 0) {
    pdf.setFontSize(FONT_SIZE_BODY);
    pdf.text("No tests found", margin, yPos);
    return yPos;
  }

  const statusCounts: Record<string, number> = {
    passed: 0,
    failed: 0,
    broken: 0,
    skipped: 0,
    unknown: 0,
  };

  for (const testResult of allTestResults) {
    const status = String(testResult.status ?? "unknown").toLowerCase();
    if (status in statusCounts) {
      statusCounts[status]++;
    } else {
      statusCounts.unknown++;
    }
  }

  const total = allTestResults.length;
  const passed = statusCounts.passed;
  const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : "0.0";

  pdf.setFontSize(FONT_SIZE_SECTION);
  pdf.text(`Pass Rate: ${passRate}% (${passed}/${total})`, margin, yPos);
  yPos += 20;

  const colors: Record<string, [number, number, number]> = {
    passed: [76, 175, 80],
    failed: [244, 67, 54],
    broken: [255, 152, 0],
    skipped: [158, 158, 158],
    unknown: [121, 85, 72],
  };

  const statusOrder = ["passed", "failed", "broken", "skipped", "unknown"];

  pdf.setFontSize(10);
  pdf.text("Test Status Distribution:", margin, yPos);
  yPos += 10;

  pdf.setFontSize(FONT_SIZE_BODY);
  let legendY = yPos;
  for (const status of statusOrder) {
    const count = statusCounts[status];
    if (count === 0) {
      continue;
    }

    const percentage = ((count / total) * 100).toFixed(1);
    pdf.setFillColor(...colors[status]);
    pdf.circle(margin, legendY, 3, "F");
    pdf.setFillColor(0, 0, 0);
    pdf.setTextColor(0, 0, 0);
    const label = `${status.toUpperCase()}: ${count} (${percentage}%)`;
    pdf.text(label, margin + 8, legendY);
    legendY += 7;
    ensureSpace(7);
  }

  return legendY;
};

export async function generateTestPdf(pdf: any, testData: AwesomeTestResult, options: any = {}): Promise<void> {
  const {
    startNewPage = false,
    testNumber = null,
    showBackToContents = false,
    contentsPageNum = null,
    ensureSpace: externalEnsureSpace = null,
  } = options;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = MARGIN;
  let yPos = margin;

  const ensureSpace =
    externalEnsureSpace ||
    ((needed: number): boolean => {
      const h = Math.max(0, Math.min(10000, Number(needed) || 0));
      if (yPos + h > pageHeight - margin) {
        pdf.addPage();
        setupUnicodeFont(pdf);
        yPos = margin;
        return true;
      }
      return false;
    });

  if (startNewPage && testNumber && testNumber > 1) {
    pdf.addPage();
    setupUnicodeFont(pdf);
    yPos = margin;
    ensureSpace(20);
    yPos += 10;
    pdf.setDrawColor(200, 200, 200);
    pdf.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 10;
  }

  setupUnicodeFont(pdf);
  pdf.setFontSize(FONT_SIZE_SECTION);
  pdf.text("Test Overview", margin, yPos);
  yPos += SPACING_SECTION;

  if (showBackToContents && contentsPageNum) {
    ensureSpace(8);
    pdf.setFontSize(9);
    setupUnicodeFont(pdf);
    pdf.setTextColor(0, 0, 200);
    const backLinkText = "Back to Contents";
    const textWidth = pdf.getTextWidth(backLinkText);
    const backLinkX = pageWidth - margin - textWidth;

    pdf.text(backLinkText, backLinkX, yPos);
    const linkHeight = 8;
    const linkYTop = yPos - 5;
    safeInternalLink(pdf, backLinkX, linkYTop, textWidth, linkHeight, contentsPageNum);
    pdf.setTextColor(0, 0, 0);
    yPos += 8;
  }

  pdf.setFontSize(FONT_SIZE_BODY);
  yPos = addKeyValue(pdf, "Name", testData.name ?? "N/A", margin, yPos, pageWidth, ensureSpace);
  yPos = addKeyValue(pdf, "Status", String(testData.status ?? "unknown").toUpperCase(), margin, yPos, pageWidth, ensureSpace);
  yPos = addKeyValue(pdf, "Full Name", testData.fullName ?? "N/A", margin, yPos, pageWidth, ensureSpace);

  const testIdParam = Array.isArray(testData.parameters)
    ? testData.parameters.find((p: any) => p?.name === "test_id")
    : null;
  const uidValue = testIdParam?.value ?? (testData as any).testId ?? testData.uid ?? "N/A";
  if (uidValue !== "N/A") {
    try {
      let testIdUrl: string;
      if (typeof window !== "undefined" && window.location) {
        const baseUrl = getAllureBaseUrl();
        const hashIndex = baseUrl.indexOf("#");
        const cleanBaseUrl = hashIndex >= 0 ? baseUrl.substring(0, hashIndex) : baseUrl;
        testIdUrl = `${cleanBaseUrl}#suites?searchQuery=${encodeURIComponent(uidValue)}`;
      } else {
        testIdUrl = `#suites?searchQuery=${encodeURIComponent(uidValue)}`;
      }
      yPos = addKeyValueWithLink(pdf, "TestID", uidValue, testIdUrl, margin, yPos, pageWidth, ensureSpace);
    } catch (e) {
      console.warn("Failed to create TestID link:", e instanceof Error ? e.message : String(e));
      yPos = addKeyValue(pdf, "TestID", uidValue, margin, yPos, pageWidth, ensureSpace);
    }
  } else {
    yPos = addKeyValue(pdf, "TestID", uidValue, margin, yPos, pageWidth, ensureSpace);
  }

  const durationMs = getDurationMs(testData.time, testData.duration);
  const durationText = durationMs !== null ? formatDurationMs(durationMs) : "N/A";
  const maxWidth = pageWidth - 2 * margin;
  const text = `Duration: ${durationText}`;
  const lines = pdf.splitTextToSize(text, maxWidth);
  ensureSpace(lines.length * 5 + 2);
  pdf.setFontSize(FONT_SIZE_BODY);
  pdf.text(lines, margin, yPos);
  yPos += lines.length * 5 + 2;

  const ranorexAttachment = await findRanorexFullReport(testData);
  if (ranorexAttachment) {
    ensureSpace(6);
    const attName = String(ranorexAttachment.name || ranorexAttachment.source || "RanorexFullReport.zip");
    const attUrl = await reportDataUrl(`data/attachments/${ranorexAttachment.source}`, ranorexAttachment.type || "application/zip");
    createAttachmentLink(pdf, attName, attUrl, margin, yPos);
    yPos += 6;
  }

  yPos = await addTestAttachments(pdf, testData, margin, yPos, pageWidth, ensureSpace);

  const description = testData.description ?? testData.descriptionHtml;
  if (description) {
    yPos += 4;
    ensureSpace(20);
    pdf.setFontSize(12);
    pdf.text("Description", margin, yPos);
    yPos += 7;
    pdf.setFontSize(9);

    const descriptionText = testData.descriptionHtml
      ? stripHtmlToText(testData.descriptionHtml)
      : String(testData.description || "");

    if (descriptionText.trim()) {
      yPos = addWrappedBlock(pdf, null, descriptionText, margin, yPos, pageWidth, ensureSpace);
    }
  }

  const msg = testData.statusDetails?.message ?? (testData as any).statusMessage;
  const trace = testData.statusDetails?.trace ?? (testData as any).statusTrace;
  if ((testData.status === "failed" || testData.status === "broken") && (msg || trace)) {
    yPos += 4;
    ensureSpace(30);
    pdf.setFontSize(12);
    pdf.text("Status Details", margin, yPos);
    yPos += 7;
    pdf.setFontSize(9);

    if (msg) {
      yPos = addWrappedBlock(pdf, "Message", String(msg), margin, yPos, pageWidth, ensureSpace);
    }
    if (trace) {
      yPos = addWrappedBlock(pdf, "Trace", String(trace), margin, yPos, pageWidth, ensureSpace);
    }
  }

  yPos += 6;
  ensureSpace(20);
  pdf.setFontSize(12);
  pdf.text("Execution", margin, yPos);
  yPos += 8;

  yPos = addStepsHeader(pdf, margin, yPos, pageWidth, ensureSpace);

  const hasSetup = Array.isArray(testData.setup) && testData.setup.length > 0;
  const hasSteps = Array.isArray(testData.steps) && testData.steps.length > 0;
  const hasTeardown = Array.isArray(testData.teardown) && testData.teardown.length > 0;

  if (hasSetup || hasSteps || hasTeardown) {
    const testStart = testData.time?.start ?? Date.now();

    if (hasSetup) {
      yPos = addStageTitle(pdf, "Set up", margin, yPos, ensureSpace);
      for (const fixture of testData.setup) {
        if (Array.isArray(fixture?.steps)) {
          yPos = await addStepsToPdf(pdf, fixture.steps, margin, yPos, pageWidth, pageHeight, ensureSpace, testStart, 0);
        }
      }
    }

    if (hasSteps) {
      yPos = addStageTitle(pdf, "Test body", margin, yPos, ensureSpace);
      yPos = await addStepsToPdf(pdf, testData.steps, margin, yPos, pageWidth, pageHeight, ensureSpace, testStart, 0);
    }

    if (hasTeardown) {
      yPos = addStageTitle(pdf, "Tear down", margin, yPos, ensureSpace);
      for (const fixture of testData.teardown) {
        if (Array.isArray(fixture?.steps)) {
          yPos = await addStepsToPdf(pdf, fixture.steps, margin, yPos, pageWidth, pageHeight, ensureSpace, testStart, 0);
        }
      }
    }
  }
}

function normalizeAttachment(att: any): { name: string; source: string; type: string } | null {
  if (!att) {
    return null;
  }

  if (att.link && typeof att.link === "object") {
    const link = att.link;
    const id = link.id || "";
    const ext = link.ext || "";
    const source = id ? `${id}${ext}` : (link.originalFileName || "");
    const name = link.name || link.originalFileName || source || "attachment";
    const type = link.contentType || "application/octet-stream";
    
    if (!source) {
      return null;
    }
    
    return { name, source, type };
  }

  if (att.source || att.name) {
    return {
      name: att.name || att.source || "attachment",
      source: att.source || att.name || "",
      type: att.type || att.contentType || "application/octet-stream",
    };
  }

  return null;
}

function collectAllAttachments(testData: AwesomeTestResult): Array<{ name: string; source: string; type: string }> {
  const attachments: Array<{ name: string; source: string; type: string }> = [];

  if (Array.isArray(testData.attachments) && testData.attachments.length > 0) {
    for (const att of testData.attachments) {
      const normalized = normalizeAttachment(att);
      if (normalized) {
        attachments.push(normalized);
      }
    }
  }

  const collectFromSteps = (steps: any[]): void => {
    if (!Array.isArray(steps)) {
      return;
    }
    for (const step of steps) {
      if (step?.attachments && Array.isArray(step.attachments)) {
        for (const att of step.attachments) {
          const normalized = normalizeAttachment(att);
          if (normalized) {
            attachments.push(normalized);
          }
        }
      }
      if (step?.steps && Array.isArray(step.steps)) {
        for (const subItem of step.steps) {
          if (subItem?.type === "attachment") {
            const normalized = normalizeAttachment(subItem);
            if (normalized) {
              attachments.push(normalized);
            }
          }
        }
        collectFromSteps(step.steps);
      }
    }
  };

  const collectFromFixtures = (fixtures: any[]): void => {
    for (const fixture of fixtures) {
      if (fixture?.attachments && Array.isArray(fixture.attachments)) {
        for (const att of fixture.attachments) {
          const normalized = normalizeAttachment(att);
          if (normalized) {
            attachments.push(normalized);
          }
        }
      }
      if (fixture?.steps) {
        collectFromSteps(fixture.steps);
      }
    }
  };

  if (Array.isArray(testData.setup)) {
    collectFromFixtures(testData.setup);
  }

  if (Array.isArray(testData.steps)) {
    collectFromSteps(testData.steps);
  }

  if (Array.isArray(testData.teardown)) {
    collectFromFixtures(testData.teardown);
  }

  return attachments;
}

async function findRanorexFullReport(testData: AwesomeTestResult): Promise<{ name: string; source: string; type: string } | null> {
  const attachments = collectAllAttachments(testData);
  const ranorexFullReportMatcher = /ranorexfullreport\.(zip|pdf)/i;
  const ranorexAttachment = attachments.find((att) => {
    if (!att || !att.source) {
      return false;
    }
    const attName = String(att.name || att.source || "").trim().toLowerCase();
    return ranorexFullReportMatcher.test(attName);
  });

  if (ranorexAttachment) {
    return {
      name: ranorexAttachment.name || ranorexAttachment.source || "RanorexFullReport.zip",
      source: ranorexAttachment.source || "",
      type: ranorexAttachment.type || "application/zip",
    };
  }

  return null;
}

function createAttachmentLink(pdf: any, text: string, url: string, x: number, yPos: number): void {
  pdf.setTextColor(0, 0, 128);
  setupUnicodeFont(pdf);
  pdf.setFontSize(9);

  if (typeof pdf.textWithLink === "function") {
    pdf.textWithLink(text, x, yPos, { url });
  } else if (typeof pdf.link === "function") {
    pdf.text(text, x, yPos);
    const textWidth = pdf.getTextWidth(text);
    const linkHeight = 8;
    const linkYTop = yPos - 5;
    try {
      pdf.link(x, linkYTop, textWidth, linkHeight, { url });
    } catch (e) {
      console.warn("Failed to create link:", e instanceof Error ? e.message : String(e));
    }
  } else {
    pdf.text(text, x, yPos);
  }
  pdf.setTextColor(0, 0, 0);
}

async function addTestAttachments(
  pdf: any,
  testData: AwesomeTestResult,
  margin: number,
  yPos: number,
  pageWidth: number,
  ensureSpace: (needed: number) => boolean,
): Promise<number> {
  const attachments = collectAllAttachments(testData);
  const ranorexFullReportMatcher = /ranorexfullreport\.zip/i;
  const filteredAttachments = attachments.filter((att) => {
    if (!att || !att.source) {
      return false;
    }
    const attName = String(att.name || att.source || "").trim().toLowerCase();
    return ranorexFullReportMatcher.test(attName);
  });

  if (filteredAttachments.length === 0) {
    return yPos;
  }

  filteredAttachments.sort((a, b) => {
    const aName = String(a.name || a.source || "").toLowerCase();
    const bName = String(b.name || b.source || "").toLowerCase();
    return aName.localeCompare(bName);
  });

  yPos += 4;
  ensureSpace(10);
  pdf.setFontSize(10);
  pdf.setTextColor(0, 0, 0);
  pdf.text("Attachments", margin, yPos);
  yPos += 7;

  pdf.setFontSize(9);

  for (const att of filteredAttachments) {
    const attName = String(att.name || att.source || "attachment");
    const attUrl = await reportDataUrl(`data/attachments/${att.source}`, att.type || "application/zip");

    ensureSpace(6);
    createAttachmentLink(pdf, attName, attUrl, margin + 5, yPos);
    yPos += 6;
  }

  return yPos;
}

async function processImageAttachment(
  pdf: any,
  att: any,
  margin: number,
  yPos: number,
  pageWidth: number,
  pageHeight: number,
  setupUnicodeFont: (pdf: any) => void,
): Promise<number> {
  const normalizedAtt = normalizeAttachment(att);
  if (!normalizedAtt) {
    return yPos;
  }

  const isImage = isImageAttachment(normalizedAtt);
  if (!isImage) {
    return yPos;
  }

  try {
    const imageUrl = await reportDataUrl(`data/attachments/${normalizedAtt.source}`, normalizedAtt.type);
    if (imageUrl) {
      return await addImageToPdf(pdf, imageUrl, normalizedAtt, margin, yPos, pageWidth, pageHeight, setupUnicodeFont);
    }
  } catch (e) {
    console.error("Error loading image attachment:", normalizedAtt?.source, normalizedAtt?.type, e);
  }

  return yPos;
}

async function addStepsToPdf(
  pdf: any,
  steps: any[],
  margin: number,
  startY: number,
  pageWidth: number,
  pageHeight: number,
  ensureSpace: (needed: number) => boolean,
  testStart: number,
  indent: number,
): Promise<number> {
  let yPos = startY;

  const addStep = async (step: any, level: number): Promise<void> => {
    if (!step) {
      return;
    }

    const stepNameRaw = String(step?.name || "Step");
    const stepNameLower = stepNameRaw.trim().toLowerCase();
    const status = step?.status || "unknown";

    if (stepNameLower === "step table") {
      return;
    }

    if (step?.attachmentStep || /ranorexfullreport\.zip/i.test(stepNameLower)) {
      return;
    }

    if ((stepNameLower === "step" || stepNameLower === "n/a" || !step?.name || stepNameRaw.trim() === "") && status === "unknown") {
      if (Array.isArray(step?.steps) && step.steps.length > 0) {
        for (const sub of step.steps) {
          await addStep(sub, level + 1);
        }
      }
      return;
    }

    const s = stepNameRaw.trim();
    const isTraceStep = /^(?:[^_]+_){3,}trace$/i.test(s);
    const isRanorexReportStep = /ranorexfullreport\.zip/i.test(stepNameRaw.trim());
    const isStepDetailsStep = stepNameRaw.trim().toLowerCase() === "step details";
    const hideStatusAndDuration = isTraceStep || isRanorexReportStep || isStepDetailsStep;

    if (isTraceStep) {
      if (Array.isArray(step?.attachments) && step.attachments.length > 0) {
        for (const att of step.attachments) {
          if (!att) {
            continue;
          }
          const attName = String(att?.name || "").trim().toLowerCase();
          if (attName === "step table") {
            continue;
          }
          yPos = await processImageAttachment(pdf, att, margin, yPos, pageWidth, pageHeight, setupUnicodeFont);
        }
      }

      if (Array.isArray(step?.steps) && step.steps.length > 0) {
        for (const subItem of step.steps) {
          if (subItem?.type === "attachment") {
            yPos = await processImageAttachment(pdf, subItem, margin, yPos, pageWidth, pageHeight, setupUnicodeFont);
          } else {
            await addStep(subItem, level + 1);
          }
        }
      }
      return;
    }

    if (yPos > pageHeight - 25) {
      pdf.addPage();
      setupUnicodeFont(pdf);
      yPos = margin;
    }

    const cols = getStepColumns(pageWidth, margin);
    const levelIndent = Math.min(16, level * 3);
    const dotX = cols.nameX - 3 + levelIndent;

    const statusColor = getStatusColor(status);

    const durationMs = getDurationMs(step?.time, step?.duration);
    const durationText = durationMs !== null ? formatShortDuration(durationMs) : "N/A";

    const nameText = normalizeText(stepNameRaw);
    pdf.setFontSize(9);

    const availableNameW = cols.nameW - levelIndent;
    const nameLines = pdf.splitTextToSize(nameText, availableNameW);

    const baseLineH = 4.2;
    const rowH = Math.max(6, nameLines.length * baseLineH);

    ensureSpace(rowH + 2);

    if (!hideStatusAndDuration) {
      pdf.setFillColor(...statusColor);
      pdf.circle(dotX, yPos - 1.5, 1.6, "F");
      pdf.setTextColor(90, 90, 90);
      pdf.text(durationText, cols.durX, yPos);
      pdf.setTextColor(0, 0, 0);
    }

    nameLines.forEach((line, i) => {
      if (i > 0) {
        ensureSpace(baseLineH);
      }
      pdf.text(line, cols.nameX + levelIndent, yPos + i * baseLineH);
    });

    if (!hideStatusAndDuration) {
      pdf.setTextColor(...statusColor);
      pdf.text(String(status).toUpperCase(), cols.statusX, yPos, { align: "right" });
      pdf.setTextColor(0, 0, 0);
    }

    yPos += rowH + 1;

    if (!isStepDetailsStep) {
      yPos = await renderStepDetails(pdf, step, margin, yPos, pageWidth, ensureSpace, levelIndent);
    }

    if (Array.isArray(step?.attachments) && step.attachments.length > 0) {
      for (const att of step.attachments) {
        if (!att) {
          continue;
        }
        const attName = String(att?.name || "").trim().toLowerCase();
        if (attName === "step table") {
          continue;
        }
        yPos = await processImageAttachment(pdf, att, cols.nameX + levelIndent, yPos, pageWidth, pageHeight, setupUnicodeFont);
      }
    }

    if (Array.isArray(step?.steps) && step.steps.length > 0) {
      for (const subItem of step.steps) {
        if (subItem?.type === "attachment") {
          yPos = await processImageAttachment(pdf, subItem, cols.nameX + levelIndent, yPos, pageWidth, pageHeight, setupUnicodeFont);
        }
      }
    }

    if (Array.isArray(step?.steps) && step.steps.length > 0) {
      for (const sub of step.steps) {
        const subName = String(sub?.name || "").trim().toLowerCase();
        if (subName === "step details" || subName === "step table") {
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

async function renderStepDetails(
  pdf: any,
  step: any,
  margin: number,
  yPos: number,
  pageWidth: number,
  ensureSpace: (needed: number) => boolean,
  levelIndent: number,
): Promise<number> {
  const maxWidth = pageWidth - 2 * margin - levelIndent;
  const x = margin + levelIndent;

  const msg = step?.statusDetails?.message ?? step?.statusMessage;
  const trace = step?.statusDetails?.trace ?? step?.statusTrace;
  const nestedDetailsText = await extractNestedStepDetailsText(step);

  const parts: Array<{ title: string; text: string }> = [];

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

    let clean = String(p.text || "");
    clean = clean
      .replace(/\\"/g, '"')
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\\\/g, "\\");
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

async function extractNestedStepDetailsText(step: any): Promise<string | null> {
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
      const textAtt = atts.find((a: any) => {
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
          const raw = await fetchText(url);
          return stripHtmlToText(raw);
        } catch (e) {
          console.error("Failed to load nested Step Details attachment:", e);
          return null;
        }
      }
    }
  }
  return null;
}
