import { ensureReportDataReady } from "@allurereport/web-commons";
import { Spinner, SvgIcon, allureIcons } from "@allurereport/web-components";
import "@allurereport/web-components/index.css";
import clsx from "clsx";
import { render } from "preact";
import "preact/debug";
import { useEffect, useState } from "preact/hooks";
import "@/assets/scss/index.scss";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { ModalComponent } from "@/components/Modal";
import { SectionSwitcher } from "@/components/SectionSwitcher";
import { fetchEnvStats, fetchReportStats, getLocale, getTheme, waitForI18next } from "@/stores";
import { fetchPieChartData } from "@/stores/chart";
import { currentEnvironment, environmentsStore, fetchEnvironments } from "@/stores/env";
import { fetchEnvInfo } from "@/stores/envInfo";
import { fetchGlobals } from "@/stores/globals";
import { getLayout, isLayoutLoading, layoutStore } from "@/stores/layout";
import { handleHashChange, route } from "@/stores/router";
import { currentSection, getSection } from "@/stores/sections";
import { fetchTestResult, fetchTestResultNav, testResultStore } from "@/stores/testResults";
import { fetchEnvTreesData, treeStore } from "@/stores/tree";
import { setTreeQuery } from "@/stores/treeFilters/actions";
import { treeQuery } from "@/stores/treeFilters";
import { fetchReportJsonData } from "@allurereport/web-commons";
import type { AwesomeTestResult } from "types";
import { isMac } from "@/utils/isMac";
import { fetchQualityGateResults } from "./stores/qualityGate";
import * as styles from "./styles.scss";

const Loader = () => {
  return (
    <div className={clsx(styles.loader, isLayoutLoading.value ? styles.loading : "")} data-testid="loader">
      <SvgIcon id={allureIcons.reportLogo} size={"m"} />
      <Spinner />
    </div>
  );
};

const App = () => {
  const className = styles[`layout-${currentSection.value !== "" ? currentSection.value : layoutStore.value}`];
  const [prefetched, setPrefetched] = useState(false);
  const testResultId = route.value.params?.testResultId ?? null;
  const prefetchData = async () => {
    const fns = [
      ensureReportDataReady,
      fetchReportStats,
      fetchPieChartData,
      fetchEnvironments,
      fetchEnvInfo,
      fetchGlobals,
      fetchQualityGateResults,
    ];

    if (globalThis) {
      fns.unshift(
        getSection as () => Promise<void>,
        getLocale,
        getLayout as () => Promise<void>,
        getTheme as () => Promise<void>,
      );
    }

    await waitForI18next;
    await Promise.all(fns.map((fn) => fn(currentEnvironment.value)));

    if (currentEnvironment.value) {
      await fetchEnvTreesData([currentEnvironment.value]);
      await fetchEnvStats(environmentsStore.value.data);
    } else {
      await fetchEnvTreesData(environmentsStore.value.data);
      await fetchEnvStats(environmentsStore.value.data);
    }

    setPrefetched(true);
  };

  useEffect(() => {
    prefetchData();
  }, [currentEnvironment.value]);

  useEffect(() => {
    if (testResultId) {
      fetchTestResult(testResultId);
      fetchTestResultNav(currentEnvironment.value);
    }
  }, [testResultId, currentEnvironment]);

  // Preload test data for search by test id
  useEffect(() => {
    const query = treeQuery.value;
    if (!query || query.length < 8) {
      return;
    }

    // Check if query looks like a test id (UUID format or similar)
    const isTestIdFormat = /^[a-f0-9-]{8,}$/i.test(query);
    if (!isTestIdFormat) {
      return;
    }

    // Try to find and load test data by test id
    const loadTestDataByTestId = async () => {
      const treeData = treeStore.value.data;
      if (!treeData) {
        return;
      }

      // Collect all test nodeIds
      const allNodeIds: string[] = [];
      for (const env in treeData) {
        const tree = treeData[env];
        if (tree && tree.leavesById) {
          for (const nodeId in tree.leavesById) {
            if (nodeId && !testResultStore.value.data?.[nodeId]) {
              allNodeIds.push(nodeId);
            }
          }
        }
      }

      // Try to load test data for first 50 tests (to avoid too many requests)
      const nodeIdsToCheck = allNodeIds.slice(0, 50);
      for (const nodeId of nodeIdsToCheck) {
        try {
          const testData = await fetchReportJsonData<AwesomeTestResult>(`data/test-results/${nodeId}.json`, {
            bustCache: true,
          });

          // Check if this test matches the search query
          let matches = false;

          // Check test_id parameter
          if (Array.isArray(testData.parameters)) {
            const testIdParam = testData.parameters.find((p: any) => p?.name === "test_id");
            if (testIdParam?.value) {
              const testIdValue = String(testIdParam.value).toLowerCase();
              if (testIdValue === query.toLowerCase() || testIdValue.includes(query.toLowerCase())) {
                matches = true;
              }
            }
          }

          // Check uid
          if (!matches && testData.uid) {
            const uidValue = String(testData.uid).toLowerCase();
            if (uidValue === query.toLowerCase() || uidValue.includes(query.toLowerCase())) {
              matches = true;
            }
          }

          // Check testCase.id if available
          if (!matches && (testData as any).testCase?.id) {
            const testCaseId = String((testData as any).testCase.id).toLowerCase();
            if (testCaseId === query.toLowerCase() || testCaseId.includes(query.toLowerCase())) {
              matches = true;
            }
          }

          // If matches, add to cache
          if (matches) {
            testResultStore.value = {
              data: { ...testResultStore.value.data, [nodeId]: testData },
              error: undefined,
              loading: false,
            };
            // Found matching test, can stop searching
            break;
          }
        } catch (error) {
          // Ignore errors for individual test loads
          continue;
        }
      }
    };

    // Debounce the search
    const timeoutId = setTimeout(() => {
      loadTestDataByTestId();
    }, 500);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [treeQuery.value]);

  useEffect(() => {
    const onHashChange = () => {
      handleHashChange();
      // Handle searchQuery from URL
      const parsed = route.value as any;
      if (parsed.searchQuery) {
        setTreeQuery(parsed.searchQuery);
      }
    };

    handleHashChange();
    // Handle initial searchQuery from URL
    const parsed = route.value as any;
    if (parsed.searchQuery) {
      setTreeQuery(parsed.searchQuery);
    }
    
    globalThis.addEventListener("hashchange", onHashChange);

    return () => {
      globalThis.removeEventListener("hashchange", onHashChange);
    };
  }, []);

  return (
    <>
      {!prefetched && <Loader />}
      {prefetched && (
        <div className={styles.main}>
          <Header className={className} />
          <SectionSwitcher />
          <Footer className={className} />
          <ModalComponent />
        </div>
      )}
    </>
  );
};

export const openInNewTab = (path: string) => {
  window.open(`#${path}`, "_blank");
};

const rootElement = document.getElementById("app");

document.addEventListener("DOMContentLoaded", () => {
  if (isMac) {
    document.documentElement.setAttribute("data-os", "mac");
  }
});

render(<App />, rootElement);
