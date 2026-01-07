import type { TestPlan, TestResult } from "../index.js";
import { findByLabelName } from "./label.js";

export const createTestPlan = (testResults: TestResult[]): TestPlan => {
  const seenIds = new Set<string>();
  const seenSelectors = new Set<string>();

  const tests = testResults
    .map((tr) => ({ selector: tr.runSelector ?? tr.fullName, id: findByLabelName(tr.labels, "ALLURE_ID") }))
    .filter(
      (value) =>
        (value.selector && (seenSelectors.has(value.selector) ? false : !!seenSelectors.add(value.selector))) ||
        (value.id && (seenIds.has(value.id) ? false : !!seenSelectors.add(value.id))),
    );

  return {
    version: "1.0",
    tests,
  };
};
