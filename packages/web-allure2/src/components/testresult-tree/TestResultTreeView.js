import EmptyView from "@/components/empty/EmptyView.js";
import ErrorSplashView from "@/components/error-splash/ErrorSplashView.js";
import SideBySideView from "@/components/side-by-side/SideBySideView.js";
import TestResultView from "@/components/testresult/TestResultView.js";
import TreeViewContainer from "@/components/tree-view-container/TreeViewContainer.js";
import TestResultModel from "@/data/testresult/TestResultModel";
import { SEARCH_QUERY_KEY } from "@/components/node-search/NodeSearchView.js";
import router from "@/router.js";
import { className } from "@/decorators/index.js";

@className("side-by-side")
class TestResultTreeView extends SideBySideView {
  initialize({ tree, routeState, csvUrl }) {
    super.initialize();
    this.csvUrl = csvUrl;
    this.tree = tree;
    this.routeState = routeState;
    this.listenTo(this.routeState, "change:treeNode", (_, treeNode) => this.showLeaf(treeNode));
    this.listenTo(this.tree, "reset", this.onTreeReset);
    this.autoSelectPending = false;
    this.autoSelectDone = false;
  }

  onTreeReset() {
    if (this.autoSelectPending && !this.autoSelectDone) {
      this.autoSelectPending = false;
      setTimeout(() => {
        this.autoSelectFirstTest();
      }, 100);
    }
  }

  autoSelectFirstTest() {
    if (this.autoSelectDone) {
      return;
    }
    const urlParams = router.getUrlParams();
    const searchQuery = urlParams[SEARCH_QUERY_KEY];
    const currentTreeNode = this.routeState.get("treeNode");

    if (searchQuery && !currentTreeNode?.testResult) {
      const firstTest = this.tree.getFirstTestResult();
      if (firstTest && firstTest.uid && firstTest.parentUid) {
        this.autoSelectDone = true;
        const treeNode = {
          testGroup: firstTest.parentUid,
          testResult: firstTest.uid,
        };
        this.routeState.set("treeNode", treeNode);
        this.routeState.set("testResultTab", "");
      }
    }
  }

  showLeaf(treeNode) {
    if (treeNode && treeNode.testResult) {
      const baseUrl = `#${this.options.baseUrl}/${treeNode.testGroup}/${treeNode.testResult}`;
      const model = new TestResultModel({ uid: treeNode.testResult });
      model.fetch({
        url: model.url(),
        success: () => this.showChildView("right", new TestResultView({ baseUrl, model, routeState: this.routeState })),
        error: () =>
          this.showChildView(
            "right",
            new ErrorSplashView({
              code: 404,
              message: `Test result with uid "${treeNode.testResult}" not found`,
            }),
          ),
      });
    } else {
      this.showChildView("right", new EmptyView({ message: "No item selected" }));
    }
  }

  onRender() {
    const { tabName, baseUrl } = this.options;
    const left = new TreeViewContainer({
      collection: this.tree,
      routeState: this.routeState,
      treeSorters: [],
      tabName: tabName,
      baseUrl: baseUrl,
      csvUrl: this.csvUrl,
    });
    this.showChildView("left", left);

    const urlParams = router.getUrlParams();
    const searchQuery = urlParams[SEARCH_QUERY_KEY];
    if (searchQuery && !this.autoSelectDone) {
      if (this.tree.testResults && this.tree.testResults.length > 0) {
        setTimeout(() => {
          this.autoSelectFirstTest();
        }, 100);
      } else {
        this.autoSelectPending = true;
      }
    }
  }

  templateContext() {
    return {
      cls: "testresult-tree",
    };
  }
}

export default TestResultTreeView;
