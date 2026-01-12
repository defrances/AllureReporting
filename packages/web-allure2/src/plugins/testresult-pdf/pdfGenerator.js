import { reportDataUrl } from "@allurereport/web-commons";
import {
  MARGIN,
  FONT_SIZE_TITLE,
  FONT_SIZE_SECTION,
  FONT_SIZE_BODY,
  SPACING_SECTION,
} from "./pdfConstants.js";
import {
  setupUnicodeFont,
  getAllureBaseUrl,
  normalizeText,
  stripHtmlToText,
  fetchText,
  formatDurationMs,
  formatShortDuration,
  getDurationMs,
  getStatusColor,
  isImageAttachment,
  addImageToPdf,
} from "./pdfUtils.js";
import {
  addKeyValue,
  addWrappedBlock,
  addStepsHeader,
  addStageTitle,
  getStepColumns,
} from "./pdfSections.js";

function safeInternalLink(pdf, x, y, w, h, pageNumber) {
  const total = pdf.internal.getNumberOfPages();
  if (!Number.isFinite(pageNumber) || pageNumber < 1 || pageNumber > total) {
    /* eslint-disable-next-line no-console */
    console.warn("Invalid link target pageNumber:", pageNumber, "total:", total);
    return;
  }
  if (typeof pdf.link !== "function") {
    /* eslint-disable-next-line no-console */
    console.warn("pdf.link is not available. Annotations plugin may be missing.");
    return;
  }
  pdf.link(x, y, w, h, { pageNumber, top: MARGIN, zoom: 0 });
}

export async function generateFullReportPdf(pdf, allTestResults) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = MARGIN;

  const testPages = [];
  let currentPage = 1;
  let yPos = margin;

  const ensureSpace = (needed) => {
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

  const addPageNumber = (pageNum) => {
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
  addTitlePage(pdf, pageWidth, pageHeight);
  pdf.addPage();
  setupUnicodeFont(pdf);
  currentPage++;
  yPos = margin;

  const contentsPageNum = currentPage;
  const contentsData = [];
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
      const testName = String(testResult.name || `Test ${i + 1}`).slice(0, 80);
      const status = String(testResult.status || "unknown").toUpperCase();

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
      const testData = testResult.testData || testResult;
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
      /* eslint-disable-next-line no-console */
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

      const testName = String(testResult.name || `Test ${tp.testIndex + 1}`).slice(0, 50);
      outline.add(testsNode, `Test: ${testName}`, { pageNumber: tp.pageStart });
    }
  }

  pdf.setDisplayMode("original", "continuous", "UseOutlines");
}

const addTitlePage = (pdf, pageWidth, pageHeight) => {
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

const addSummaryPage = (pdf, allTestResults, pageWidth, pageHeight, margin, yPos, ensureSpace) => {
  setupUnicodeFont(pdf);
  pdf.setFontSize(FONT_SIZE_TITLE);
  pdf.text("Summary", margin, yPos);
  yPos += 20;

  if (allTestResults.length === 0) {
    pdf.setFontSize(FONT_SIZE_BODY);
    pdf.text("No tests found", margin, yPos);
    return yPos;
  }

  const statusCounts = {
    passed: 0,
    failed: 0,
    broken: 0,
    skipped: 0,
    unknown: 0,
  };

  for (const testResult of allTestResults) {
    const status = String(testResult.status || "unknown").toLowerCase();
    if (Object.prototype.hasOwnProperty.call(statusCounts, status)) {
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

  const colors = {
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

export async function generateTestPdf(pdf, testData, options = {}) {
  const { startNewPage = false, testNumber = null, showBackToContents = false, contentsPageNum = null, ensureSpace: externalEnsureSpace = null } = options;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = MARGIN;
  let yPos = margin;

  const ensureSpace = externalEnsureSpace || ((needed) => {
    const h = Math.max(0, Math.min(10000, Number(needed) || 0));
    if (yPos + h > pageHeight - margin) {
      pdf.addPage();
      setupUnicodeFont(pdf);
      yPos = margin;
      return true;
    }
    return false;
  });

  if (startNewPage && testNumber > 1) {
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
  yPos = addKeyValue(pdf, "Name", testData.name || "N/A", margin, yPos, pageWidth, ensureSpace);
  yPos = addKeyValue(pdf, "Status", String(testData.status || "unknown").toUpperCase(), margin, yPos, pageWidth, ensureSpace);
  yPos = addKeyValue(pdf, "Full Name", testData.fullName || "N/A", margin, yPos, pageWidth, ensureSpace);

  const testIdParam = Array.isArray(testData.parameters)
    ? testData.parameters.find((p) => p?.name === "test_id")
    : null;
  const uidValue = testIdParam?.value || testData.testId || testData.uid || "N/A";
  yPos = addKeyValue(pdf, "TestID", uidValue, margin, yPos, pageWidth, ensureSpace);

  const durationMs = testData.time?.duration;
  const durationText = Number.isFinite(durationMs) ? formatDurationMs(durationMs) : "N/A";
  const maxWidth = pageWidth - 2 * margin;
  const text = `Duration: ${durationText}`;
  const lines = pdf.splitTextToSize(text, maxWidth);
  ensureSpace(lines.length * 5 + 2);
  pdf.setFontSize(FONT_SIZE_BODY);
  pdf.text(lines, margin, yPos);
  yPos += lines.length * 5 + 2;

  yPos = await addTestAttachments(pdf, testData, margin, yPos, pageWidth, ensureSpace);

  const description = testData.description || testData.descriptionHtml;
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

  const hasBeforeStages = Array.isArray(testData.beforeStages) && testData.beforeStages.length > 0;
  const hasTestStage = Array.isArray(testData.testStage?.steps) && testData.testStage.steps.length > 0;
  const hasAfterStages = Array.isArray(testData.afterStages) && testData.afterStages.length > 0;

  if (hasBeforeStages || hasTestStage || hasAfterStages) {
    const testStart = testData.time?.start || Date.now();

    if (hasBeforeStages) {
      yPos = addStageTitle(pdf, "Set up", margin, yPos, ensureSpace);
      for (const st of testData.beforeStages) {
        if (Array.isArray(st?.steps)) {
          yPos = await addStepsToPdf(pdf, st.steps, margin, yPos, pageWidth, pageHeight, ensureSpace, testStart, 0);
        }
      }
    }

    if (hasTestStage) {
      yPos = addStageTitle(pdf, "Test body", margin, yPos, ensureSpace);
      yPos = await addStepsToPdf(pdf, testData.testStage.steps, margin, yPos, pageWidth, pageHeight, ensureSpace, testStart, 0);
    }

    if (hasAfterStages) {
      yPos = addStageTitle(pdf, "Tear down", margin, yPos, ensureSpace);
      for (const st of testData.afterStages) {
        if (Array.isArray(st?.steps)) {
          yPos = await addStepsToPdf(pdf, st.steps, margin, yPos, pageWidth, pageHeight, ensureSpace, testStart, 0);
        }
      }
    }
  }

  return yPos;
}

async function addTestAttachments(pdf, testData, margin, yPos, pageWidth, ensureSpace) {
  const attachments = [];

  if (Array.isArray(testData.attachments) && testData.attachments.length > 0) {
    attachments.push(...testData.attachments);
  }

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

  if (testData.testStage) {
    if (testData.testStage.attachments && Array.isArray(testData.testStage.attachments)) {
      attachments.push(...testData.testStage.attachments);
    }
    if (testData.testStage.steps) {
      collectFromSteps(testData.testStage.steps);
    }
  }

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

  const ranorexFullReportMatcher = /ranorexfullreport\.zip/i;
  const filteredAttachments = attachments.filter((att) => {
    if (!att || !att.source) {
      return false;
    }
    const attName = String(att.name || att.source || "").trim().toLowerCase();
    const isRanorexFullReport = ranorexFullReportMatcher.test(attName);
    return isRanorexFullReport;
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
    pdf.setTextColor(0, 0, 128);

    const x = margin + 5;
    setupUnicodeFont(pdf);
    pdf.setFontSize(9);
    
    if (typeof pdf.textWithLink === "function") {
      pdf.textWithLink(attName, x, yPos, { url: attUrl });
    } else {
      pdf.text(attName, x, yPos);
      const textWidth = pdf.getTextWidth(attName);
      const linkHeight = 8;
      const linkYTop = yPos - 5;
      if (typeof pdf.link === "function") {
        try {
          pdf.link(x, linkYTop, textWidth, linkHeight, { url: attUrl });
        } catch (e) {
          /* eslint-disable-next-line no-console */
          console.warn("Failed to create attachment link:", e.message || e);
        }
      } else {
        /* eslint-disable-next-line no-console */
        console.warn("pdf.link is not available for attachment link");
      }
    }

    pdf.setTextColor(0, 0, 0);
    yPos += 6;
  }

  return yPos;
}

async function addStepsToPdf(
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

    const stepNameRaw = String(step?.name || "Step");
    const stepNameLower = stepNameRaw.trim().toLowerCase();

    if (stepNameLower === "step table") {
      return;
    }

    if (step?.attachmentStep && stepNameLower === "step table") {
      return;
    }

    if (/ranorexfullreport\.zip/i.test(stepNameLower)) {
      return;
    }

    const isTraceStep = /^NGPVHOST_.*_trace$/i.test(stepNameRaw.trim());
    const isRanorexReportStep = /ranorexfullreport\.zip/i.test(stepNameRaw.trim());
    const isStepDetailsStep = stepNameRaw.trim().toLowerCase() === "step details";
    const hasNestedStepDetails =
      Array.isArray(step?.steps) && step.steps.some((s) => String(s?.name || "").trim().toLowerCase() === "step details");
    const hideStatusAndDuration = isTraceStep || isRanorexReportStep || isStepDetailsStep || hasNestedStepDetails;

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

          if (isImageAttachment(att)) {
            try {
              const imageUrl = await reportDataUrl(`data/attachments/${att.source}`, att.type);
              if (imageUrl) {
                yPos = await addImageToPdf(pdf, imageUrl, att, margin, yPos, pageWidth, pageHeight, setupUnicodeFont);
              }
            } catch (e) {
              console.error("Error loading image attachment:", att?.source, e);
            }
          }
        }
      }

      if (Array.isArray(step?.steps) && step.steps.length > 0) {
        for (const sub of step.steps) {
          await addStep(sub, level + 1);
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

    const status = step?.status || "unknown";
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
    }

    if (!hideStatusAndDuration) {
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

        if (isImageAttachment(att)) {
          try {
            const imageUrl = await reportDataUrl(`data/attachments/${att.source}`, att.type);
            if (imageUrl) {
              yPos = await addImageToPdf(pdf, imageUrl, att, cols.nameX + levelIndent, yPos, pageWidth, pageHeight, setupUnicodeFont);
            }
          } catch (e) {
            console.error("Error loading image attachment:", att?.source, e);
          }
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

  const msg = step?.statusDetails?.message || step?.statusMessage;
  const trace = step?.statusDetails?.trace || step?.statusTrace;
  const nestedDetailsText = await extractNestedStepDetailsText(step);

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

async function extractNestedStepDetailsText(step) {
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
