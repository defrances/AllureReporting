import { IconButton, TooltipWrapper, allureIcons } from "@allurereport/web-components";
import { jsPDF } from "jspdf";
import { useState } from "preact/hooks";
import type { FunctionalComponent } from "preact";
import type { AwesomeTestResult } from "types";
import { setupUnicodeFont } from "@/utils/pdf/pdfUtils";
import { generateTestPdf } from "@/utils/pdf/pdfGenerator";
import { useI18n } from "@/stores/locale";
import * as styles from "./styles.scss";

export type TrPdfButtonProps = {
  testResult?: AwesomeTestResult;
};

export const TrPdfButton: FunctionalComponent<TrPdfButtonProps> = ({ testResult }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const { t } = useI18n("ui");

  const handleDownload = async () => {
    if (!testResult || isGenerating) {
      return;
    }

    setIsGenerating(true);

    try {
      const pdf = new jsPDF("p", "mm", "a4");
      setupUnicodeFont(pdf);

      await generateTestPdf(pdf, testResult);

      const fileName = `${String(testResult.name || "test").replace(/[^a-z0-9]/gi, "_").slice(0, 50)}.pdf`;
      pdf.save(fileName);
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("Error generating PDF: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setIsGenerating(false);
    }
  };

  if (!testResult) {
    return null;
  }

  return (
    <TooltipWrapper tooltipText={isGenerating ? t("generatingPdf") : t("downloadPdf")}>
      <IconButton
        icon={allureIcons.lineGeneralDownloadCloud}
        size="s"
        style="ghost"
        onClick={handleDownload}
        disabled={isGenerating}
        data-testid="test-result-pdf-button"
        className={styles["pdf-button"]}
      />
    </TooltipWrapper>
  );
};
