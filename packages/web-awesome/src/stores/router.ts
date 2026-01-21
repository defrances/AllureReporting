import { computed, signal } from "@preact/signals";

type NavigateToObject = {
  category?: string;
  params?: {
    testResultId?: string | null;
    subTab?: string | null;
  };
};

type Route = {
  category?: string;
  params?: {
    testResultId?: string | null;
    subTab?: string | null;
  };
};

export const parseHash = (): Route & { searchQuery?: string } => {
  const hash = globalThis.location.hash.replace(/^#/, "").trim();
  
  // Extract query parameters from hash (e.g., #suites?searchQuery=test-id)
  const [pathPart, queryPart] = hash.split("?");
  const queryParams: Record<string, string> = {};
  
  if (queryPart) {
    const pairs = queryPart.split("&");
    for (const pair of pairs) {
      const [key, value] = pair.split("=");
      if (key && value) {
        queryParams[decodeURIComponent(key)] = decodeURIComponent(value);
      }
    }
  }
  
  const parts = pathPart.split("/").filter(Boolean);
  const [first, second] = parts;

  const result: Route & { searchQuery?: string } = {};

  if (queryParams.searchQuery) {
    result.searchQuery = queryParams.searchQuery;
  }

  if (parts.length === 0) {
    return result;
  }

  if (parts.length === 1) {
    if (/^[a-f0-9]{32,}$/.test(first)) {
      return { ...result, params: { testResultId: first } };
    }
    return { ...result, category: first || "", params: { testResultId: second } };
  }

  if (parts.length === 2) {
    if (/^[a-f0-9]{32,}$/.test(first)) {
      return {
        ...result,
        params: {
          testResultId: first,
          subTab: second,
        },
      };
    }

    return {
      ...result,
      category: first,
      params: {
        testResultId: second,
      },
    };
  }

  if (parts.length === 3) {
    const [category, testResultId, subTab] = parts;
    return { ...result, category, params: { testResultId, subTab } };
  }

  return result;
};

export const route = signal<Route>(parseHash());

export const handleHashChange = () => {
  const newRoute = parseHash();

  if (
    newRoute.category !== route.value?.category ||
    newRoute.params?.testResultId !== route.value.params?.testResultId ||
    newRoute.params?.subTab !== route.value.params?.subTab
  ) {
    route.value = { ...newRoute };
  }
};

export const navigateTo = (path: NavigateToObject | string) => {
  let newHash = "";

  if (typeof path === "string") {
    newHash = path.startsWith("#") ? path.slice(1) : path;
  } else {
    const { category, params = {} } = path;
    const parts: string[] = [];

    if (category) {
      parts.push(category);
    }

    if (params.testResultId) {
      parts.push(params.testResultId);
    }

    if (params.subTab) {
      parts.push(params.subTab);
    }

    newHash = parts.join("/");
  }

  history.pushState(null, "", `#${newHash}`);
  handleHashChange();
};

export const openInNewTab = (path: string) => {
  window.open(`#${path}`, "_blank");
};

export const activeTab = computed(() => route.value.category || "");
export const activeSubTab = computed(() => route.value.params?.subTab || "overview");
