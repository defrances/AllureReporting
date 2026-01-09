import { jsPDF } from "jspdf";
import { View } from "backbone.marionette";
import { className, on } from "@/decorators/index.js";
import template from "./PdfView.hbs";
import "./styles.scss";
import { setupUnicodeFont } from "./pdfUtils.js";
import { generateTestPdf } from "./pdfGenerator.js";

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
      setupUnicodeFont(pdf);

      await generateTestPdf(pdf, testData);

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

  translate(key, defaultValue) {
    return this.options.translate ? this.options.translate(key, defaultValue) : defaultValue;
  }
}

export default PdfView;
