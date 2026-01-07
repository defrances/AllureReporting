import type { TestLabel } from "../index.js";

export const findByLabelName = (labels: TestLabel[], name: string): string | undefined => {
  return labels.find((label) => label.name === name)?.value;
};
