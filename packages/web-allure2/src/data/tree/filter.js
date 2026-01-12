import { values as marksValues } from "@/utils/marks.js";

function byStatuses(statuses) {
  return (child) => {
    if (child.children) {
      return child.children.length > 0;
    }
    return statuses[child.status];
  };
}

function byDuration(min, max) {
  return (child) => {
    if (child.children) {
      return child.children.length > 0;
    }
    return min <= child.time.duration && child.time.duration <= max;
  };
}

function isUuid(str) {
  if (!str || typeof str !== "string") {
    return false;
  }
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str.trim());
}

function byCriteria(searchQuery) {
  if (!searchQuery) {
    return byText("");
  }
  const trimmed = searchQuery.trim();
  if (trimmed.startsWith("tag:")) {
    return byTags(trimmed.substring(4));
  } else if (trimmed.startsWith("test_id:")) {
    return byTestId(trimmed.substring(8));
  } else if (isUuid(trimmed)) {
    return byTestId(trimmed);
  } else {
    return byText(searchQuery);
  }
}

function byText(text) {
  text = (text && text.toLowerCase()) || "";
  return (child) => {
    return (
      !text || child.name.toLowerCase().indexOf(text) > -1 || (child.children && child.children.some(byText(text)))
    );
  };
}

function byTags(tag) {
  tag = (tag && tag.toLowerCase().trim()) || "";
  const tags = tag.split(/\s*,\s*/).filter((t) => t);
  return (child) => {
    const childTags = Array.isArray(child.tags) ? child.tags.filter((t) => t).map((t) => t.toLowerCase().trim()) : [];
    return !tag || tags.every((t) => childTags.indexOf(t) > -1) || (child.children && child.children.some(byTags(tag)));
  };
}

function byTestId(testId) {
  testId = (testId && testId.trim()) || "";
  return (child) => {
    if (child.children) {
      return child.children.some(byTestId(testId));
    }
    if (!testId) {
      return true;
    }
    const testIdLower = testId.toLowerCase();
    const parameters = child.parameters || [];
    if (Array.isArray(parameters)) {
      return parameters.some((param) => {
        if (typeof param === "string") {
          return param.toLowerCase().indexOf(testIdLower) > -1;
        }
        if (param && typeof param === "object") {
          if (param.name === "test_id" || param.name?.toLowerCase() === "test_id") {
            return String(param.value || "").toLowerCase().indexOf(testIdLower) > -1;
          }
        }
        return false;
      });
    }
    return false;
  };
}

function byMark(marks) {
  return (child) => {
    if (child.children) {
      return child.children.length > 0;
    }
    return marksValues.map((k) => !marks[k] || child[k]).reduce((a, b) => a && b, true);
  };
}

function mix(...filters) {
  return (child) => {
    let result = true;
    filters.forEach((filter) => {
      result = result && filter(child);
    });
    return result;
  };
}

export { byStatuses, byDuration, byCriteria, byText, byTags, byMark, mix };
