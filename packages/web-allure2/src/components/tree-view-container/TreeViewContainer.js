import { Model } from "backbone";
import { View } from "backbone.marionette";
import { jsPDF } from "jspdf";
import MarksToggleView from "@/components/marks-toggle/MarksToggleView.js";
import NodeSearchView from "@/components/node-search/NodeSearchView.js";
import NodeSorterView from "@/components/node-sorter/NodeSorterView.js";
import StatusToggleView from "@/components/status-toggle/StatusToggleView.js";
import TreeView from "@/components/tree/TreeView.js";
import TestResultModel from "@/data/testresult/TestResultModel.js";
import { behavior, className, on, regions } from "@/decorators/index.js";
import gtag from "@/utils/gtag.js";
import { getSettingsForTreePlugin } from "@/utils/settingsFactory.js";
import {
  setupUnicodeFont,
} from "@/plugins/testresult-pdf/pdfUtils.js";
import { generateTestPdf } from "@/plugins/testresult-pdf/pdfGenerator.js";
import template from "./TreeViewContainer.hbs";
import "./styles.scss";

@className("tree")
@behavior("TooltipBehavior", { position: "bottom" })
@regions({
  search: ".pane__search",
  sorter: ".tree__sorter",
  filter: ".tree__filter",
  filterMarks: ".tree__filter-marks",
  content: ".tree__content",
})
class TreeViewContainer extends View {
  template = template;

  initialize({
    routeState,
    state = new Model(),
    tabName,
    baseUrl,
    csvUrl = null,
    settings = getSettingsForTreePlugin(baseUrl),
  }) {
    this.state = state;
    this.routeState = routeState;
    this.baseUrl = baseUrl;
    this.csvUrl = csvUrl;
    this.tabName = tabName;
    this.listenTo(this.routeState, "change:testResultTab", this.render);
    this.settings = settings;
  }

  @on("click .tree__info")
  onInfoClick() {
    const show = this.settings.isShowGroupInfo();
    this.settings.setShowGroupInfo(!show);
    gtag("tree_info_click", { enable: !show });
  }

  @on("click .tree__download-pdf")
  async onDownloadAllPdf() {
    const button = this.$(".tree__download-pdf");
    const originalOpacity = button.css("opacity");

    try {
      button.css("opacity", "0.5");
      button.css("pointer-events", "none");

      const allResults = this.collection.allResults || [];
      if (allResults.length === 0) {
        alert("No test results available");
        return;
      }

      const pdf = new jsPDF("p", "mm", "a4");
      setupUnicodeFont(pdf);

      for (let i = 0; i < allResults.length; i++) {
        const testResult = allResults[i];
        if (!testResult || !testResult.uid) {
          continue;
        }

        try {
          const model = new TestResultModel({ uid: testResult.uid });
          await model.fetch();
          const testData = model.toJSON();

          await generateTestPdf(pdf, testData, {
            startNewPage: i > 0,
            testNumber: i + 1,
          });
        } catch (error) {
          console.error(`Error loading test ${testResult.uid}:`, error);
          continue;
        }
      }

      const fileName = `all-test-results-${new Date().toISOString().slice(0, 10)}.pdf`;
      pdf.save(fileName);
      gtag("pdf_all_download_click", { count: allResults.length });
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("Error generating PDF: " + error.message);
    } finally {
      button.css("opacity", originalOpacity);
      button.css("pointer-events", "auto");
    }
  }

  onRender() {
    this.showChildView(
      "content",
      new TreeView({
        state: this.state,
        routeState: this.routeState,
        tabName: this.tabName,
        baseUrl: this.baseUrl,
        settings: this.settings,
        collection: this.collection,
      }),
    );

    this.showChildView(
      "search",
      new NodeSearchView({
        state: this.state,
      }),
    );
    this.showChildView(
      "sorter",
      new NodeSorterView({
        settings: this.settings,
      }),
    );
    this.showChildView(
      "filter",
      new StatusToggleView({
        settings: this.settings,
        statistic: this.collection.statistic,
      }),
    );
    this.showChildView(
      "filterMarks",
      new MarksToggleView({
        settings: this.settings,
      }),
    );
  }

  templateContext() {
    return {
      cls: this.className,
      showGroupInfo: this.settings.isShowGroupInfo(),
      tabName: this.tabName,
      shownCases: 0,
      totalCases: 0,
      filtered: false,
      csvUrl: this.csvUrl,
    };
  }
}

export default TreeViewContainer;
