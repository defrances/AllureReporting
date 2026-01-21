import { defaultChartsConfig, defineConfig } from "allure";

const chartLayout = [
  {
    type: "trend",
    dataType: "status",
    mode: "percent",
  },
  {
    type: "trend",
    dataType: "status",
    limit: 10,
  },
  {
    title: "Custom Status Trend",
    type: "trend",
    dataType: "status",
    mode: "percent",
    limit: 15,
  },
  {
    type: "trend",
    dataType: "status",
    limit: 15,
    metadata: {
      executionIdAccessor: (executionOrder) => `build-${executionOrder}`,
      executionNameAccessor: (executionOrder) => `build #${executionOrder}`,
    },
  },
  {
    type: "trend",
    dataType: "severity",
    limit: 15,
  },
  {
    type: "pie",
  },
  {
    type: "pie",
    title: "Custom Pie",
  },
];

export default defineConfig({
  name: "Allure Report",
  output: "./allure-report",
  qualityGate: {
    rules: [
      {
        maxFailures: 5,
        fastFail: true,
      },
    ],
  },
  plugins: {
    awesome: {
      options: {
        singleFile: false,
        reportLanguage: "en",
      },
    },
    allure2: {
      options: {
        singleFile: false,
        reportName: "Allure 2 Report",
        reportLanguage: "en",
      },
    },
  },
  variables: {
    env_variable: "unknown",
  },
  environments: {
    foo: {
      variables: {
        env_variable: "foo",
        env_specific_variable: "foo",
      },
      matcher: ({ labels }) => labels.some(({ name, value }) => name === "env" && value === "foo"),
    },
    bar: {
      variables: {
        env_variable: "bar",
        env_specific_variable: "bar",
      },
      matcher: ({ labels }) => labels.some(({ name, value }) => name === "env" && value === "bar"),
    },
  },
});
