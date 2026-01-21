import { Button, Text, TooltipWrapper, allureIcons } from "@allurereport/web-components";
import { jsPDF } from "jspdf";
import { useState } from "preact/hooks";
import type { FunctionalComponent } from "preact";
import { setupUnicodeFont } from "@/utils/pdf/pdfUtils";
import { generateFullReportPdf } from "@/utils/pdf/pdfGenerator";
import { useI18n } from "@/stores/locale";
import { treeStore } from "@/stores/tree";
import { testResultStore } from "@/stores/testResults";
import { fetchReportJsonData } from "@allurereport/web-commons";
import type { AwesomeTestResult } from "types";

export const ReportPdfButton: FunctionalComponent = () => {
  const [isGenerating, setIsGenerating] = useState(false);
  const { t } = useI18n("ui");

  const handleDownload = async () => {
    if (isGenerating) {
      return;
    }

    setIsGenerating(true);

    try {
      const treeData = treeStore.value.data;
      if (!treeData) {
        alert("No test results available");
        return;
      }

      const allTestIds: Array<{ nodeId: string; name?: string; status?: string }> = [];

      for (const env in treeData) {
        const tree = treeData[env];
        if (tree?.leavesById) {
          for (const nodeId in tree.leavesById) {
            const leaf = tree.leavesById[nodeId];
            if (leaf?.nodeId) {
              allTestIds.push({
                nodeId: leaf.nodeId,
                name: leaf.name,
                status: leaf.status,
              });
            }
          }
        }
      }

      if (allTestIds.length === 0) {
        alert("No test results available");
        return;
      }

      const testDataArray = [];
      for (let i = 0; i < allTestIds.length; i++) {
        const testInfo = allTestIds[i];
        if (!testInfo || !testInfo.nodeId) {
          continue;
        }

        try {
          const testData = await fetchReportJsonData<AwesomeTestResult>(`data/test-results/${testInfo.nodeId}.json`, {
            bustCache: true,
          });
          testDataArray.push({
            uid: testInfo.nodeId,
            name: testInfo.name,
            status: testInfo.status,
            testData,
          });
        } catch (error) {
          console.error(`Error loading test ${testInfo.nodeId}:`, error);
          continue;
        }
      }

      if (testDataArray.length === 0) {
        alert("No test results could be loaded");
        return;
      }

      const pdf = new jsPDF("p", "mm", "a4");
      setupUnicodeFont(pdf);

      await generateFullReportPdf(pdf, testDataArray);

      const fileName = `all-test-results-${new Date().toISOString().slice(0, 10)}.pdf`;
      pdf.save(fileName);
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("Error generating PDF: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <TooltipWrapper tooltipText={isGenerating ? t("generatingPdf") : t("downloadPdf")}>
      <Button
        type="button"
        icon={allureIcons.lineGeneralDownloadCloud}
        text={isGenerating ? t("generatingPdf") : t("downloadPdf")}
        size="m"
        style="outline"
        onClick={handleDownload}
        disabled={isGenerating}
        data-testid="report-pdf-button"
      />
    </TooltipWrapper>
  );
};
