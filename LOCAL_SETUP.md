# Local Setup for Allure 3

This document describes how to run Allure 3 locally without Docker.

## Requirements

- Node.js (version 20 or higher)
- Yarn (version 4.5.1 or higher)
- Git

## Quick Start

### 1. Install Dependencies

First, install all project dependencies:

```bash
yarn install
```

### 2. Build the Project

Build all packages in the monorepo:

```bash
yarn build
```

This will compile all TypeScript packages and prepare them for use.

### 3. Generate a Report

You can generate a report in several ways:

#### Option A: Generate from Existing Test Results

If you have test results in an `allure-results` directory:

```bash
yarn allure generate allure-results --config=allurerc.mjs
```

Or using the npm script:

```bash
yarn report
```

#### Option B: Generate Sample Report

To generate a sample report for testing, you can run tests in the sandbox package:

```bash
cd packages/sandbox
yarn test
yarn report
```

This will generate test results and create a report in the `out/allure-report` directory.

### 4. View the Report

Open the generated report in your browser:

```bash
yarn allure open out/allure-report
```

To open a specific plugin report (e.g., Allure 2):

```bash
yarn allure open out/allure-report/allure2
```

To open the Awesome report:

```bash
yarn allure open out/allure-report/awesome
```

To open the Classic report:

```bash
yarn allure open out/allure-report/classic
```

You can also open a directory with result files directly. The report will be generated on the fly:

```bash
yarn allure open ./allure-results
```

### 5. Watch Mode (Real-time Updates)

For real-time report updates during test execution:

```bash
yarn allure watch <allure-results-directory>
```

This command continuously monitors the results directory and automatically refreshes the report when new results are detected.

## Development Workflow

### Running Tests

Run all tests in the project:

```bash
yarn test
```

### Using Sandbox for Testing

The `packages/sandbox` package is designed as a playground for development and testing:

```bash
cd packages/sandbox
yarn test
yarn report
```

### Hot Module Replacement for Web Development

If you're developing web plugins (Awesome, Classic, Allure 2, Dashboard), you can use webpack's hot module replacement:

1. Generate a report first (see step 3 above)
2. Copy data files to the dev directory (see package-specific CONTRIBUTING.md files)
3. Run the dev server:

```bash
# For Awesome plugin
yarn workspace @allurereport/web-awesome dev

# For Classic plugin
yarn workspace @allurereport/web-classic dev

# For Dashboard plugin
yarn workspace @allurereport/web-dashboard dev
```

The dev server will start on `http://localhost:8080` with hot reload enabled.

## Configuration

The project uses `allurerc.mjs` for configuration. You can customize:

- Report name
- Output directory
- Enabled plugins (Awesome, Classic, Allure 2, Dashboard, etc.)
- Plugin-specific options

Example configuration:

```javascript
import { defineConfig } from "allure";

export default defineConfig({
  name: "Allure Report Example",
  output: "./out/allure-report",
  plugins: {
    awesome: {
      options: {
        singleFile: false,
        reportLanguage: "en",
        reportName: "Allure 3 Report",
      },
    },
    classic: {
      options: {
        singleFile: false,
        reportLanguage: "en",
      },
    },
    allure2: {
      options: {
        singleFile: false,
        reportLanguage: "en",
      },
    },
  },
});
```

## Common Commands

| Command | Description |
|---------|-------------|
| `yarn install` | Install all dependencies |
| `yarn build` | Build all packages |
| `yarn test` | Run all tests |
| `yarn report` | Generate report from allure-results |
| `yarn allure generate <dir>` | Generate report from specific directory |
| `yarn allure open <dir>` | Open report in browser |
| `yarn allure watch <dir>` | Watch mode for real-time updates |
| `yarn allure --version` | Check Allure version |
| `yarn allure --help` | Show help |

## Troubleshooting

### Build Errors

If you encounter build errors:

1. Clean the project:
   ```bash
   yarn clean
   ```

2. Reinstall dependencies:
   ```bash
   rm -rf node_modules .yarn/cache
   yarn install
   ```

3. Rebuild:
   ```bash
   yarn build
   ```

### Port Already in Use

If port 8080 is already in use, you can specify a different port:

```bash
yarn allure open --port 3000 out/allure-report
```

### No Test Results Found

If you don't have test results:

1. Run tests in the sandbox:
   ```bash
   cd packages/sandbox
   yarn test
   ```

2. Or mount your own test results directory when generating:
   ```bash
   yarn allure generate /path/to/your/allure-results --config=allurerc.mjs
   ```

### Report Not Opening

Make sure you've generated a report first:

```bash
yarn report
yarn allure open out/allure-report
```

## Project Structure

- `packages/cli` - CLI commands
- `packages/core` - Core functionality
- `packages/reader` - Test results reader
- `packages/web-awesome` - Awesome plugin UI
- `packages/web-classic` - Classic plugin UI
- `packages/web-allure2` - Allure 2 plugin UI
- `packages/web-dashboard` - Dashboard plugin UI
- `packages/sandbox` - Development playground
- `out/allure-report` - Generated reports directory
- `allure-results` - Test results directory (if available)

## Next Steps

- Read the main [README.md](./README.md) for more information about Allure 3
- Check [CONTRIBUTING.md](./CONTRIBUTING.md) for development guidelines
- Explore plugin-specific documentation in `packages/*/README.md`



