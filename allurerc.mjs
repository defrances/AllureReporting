import { defineConfig } from "allure";
import { qualityGateDefaultRules } from "allure/rules";
import { env } from "node:process";

const { ALLURE_SERVICE_URL, ALLURE_SERVICE_ACCESS_TOKEN, ALLURE_SERVICE_PROJECT } = env;

/**
 * @type {import("allure").AllureConfig}
 */
const config = {
  name: "Allure Report 3",
  output: "./out/allure-report",
  plugins: {
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
  qualityGate: {
    rules: [
      {
        maxFailures: 0,
        fastFail: true,
      },
    ],
    use: [...qualityGateDefaultRules],
  },
};

if (ALLURE_SERVICE_URL && ALLURE_SERVICE_ACCESS_TOKEN && ALLURE_SERVICE_PROJECT) {
  config.allureService = {
    url: ALLURE_SERVICE_URL,
    project: ALLURE_SERVICE_PROJECT,
    accessToken: ALLURE_SERVICE_ACCESS_TOKEN,
    publish: true,
  };
}

export default defineConfig(config);
