# Docker Setup for Allure 3

This document describes how to run Allure 3 in a Docker container.

## Requirements

- Docker
- Docker Compose (optional, but recommended)

## Quick Start

### Option 1: Using Docker Compose (Recommended)

1. **Build the image and start the container:**

```bash
docker-compose up --build
```

2. **Open your browser and navigate to:**

```
http://localhost:8080
```

### Option 2: Using Docker Directly

1. **Build the image:**

```bash
docker build -t allure-report .
```

2. **Run the container:**

```bash
docker run -d \
  --name allure-report \
  -p 8080:8080 \
  -v $(pwd)/allure-results:/app/allure-results:ro \
  -v $(pwd)/out:/app/out \
  allure-report
```

3. **Open your browser and navigate to:**

```
http://localhost:8080
```

## Configuration

### Mounting Test Results

To generate reports from test results, mount the results directory:

```bash
docker run -d \
  --name allure-report \
  -p 8080:8080 \
  -v /path/to/your/allure-results:/app/allure-results:ro \
  -v $(pwd)/out:/app/out \
  allure-report
```

### Using Custom Configuration File

You can use your own `allurerc.mjs`:

```bash
docker run -d \
  --name allure-report \
  -p 8080:8080 \
  -v $(pwd)/allurerc.mjs:/app/allurerc.mjs:ro \
  -v $(pwd)/allure-results:/app/allure-results:ro \
  -v $(pwd)/out:/app/out \
  allure-report
```

### Changing Port

To change the port, modify the port mapping:

```bash
docker run -d \
  --name allure-report \
  -p 3000:8080 \
  -v $(pwd)/allure-results:/app/allure-results:ro \
  -v $(pwd)/out:/app/out \
  allure-report
```

Or in `docker-compose.yml`:

```yaml
ports:
  - "3000:8080"
```

## Directory Structure

- `/app/allure-results` - test results directory (read-only)
- `/app/out` - directory for generated reports
- `/app/allurerc.mjs` - configuration file

## Commands

### Stopping the Container

```bash
docker-compose down
```

or

```bash
docker stop allure-report
docker rm allure-report
```

### Viewing Logs

```bash
docker-compose logs -f
```

or

```bash
docker logs -f allure-report
```

### Rebuilding the Image

```bash
docker-compose build --no-cache
```

or

```bash
docker build --no-cache -t allure-report .
```

## Manual Report Generation

If you want to generate a report manually inside the container:

```bash
docker exec -it allure-report yarn allure generate /app/allure-results --config=/app/allurerc.mjs
```

## Troubleshooting

### Container Won't Start

Check the logs:

```bash
docker logs allure-report
```

### Port Already in Use

Change the port in `docker-compose.yml` or use a different port when running:

```bash
docker run -d -p 3000:8080 ...
```

### Report Not Generating

Make sure:
1. The `allure-results` directory is mounted and contains test results
2. The configuration file `allurerc.mjs` is correct
3. Check container logs for errors

## Production Usage

For production use, it is recommended to:

1. Use a specific image version instead of `latest`
2. Configure healthcheck (already included in docker-compose.yml)
3. Configure automatic restart
4. Use a reverse proxy (nginx, traefik) for SSL/TLS

Example production docker-compose.yml:

```yaml
services:
  allure:
    build:
      context: .
      dockerfile: Dockerfile
    image: allure-report:3.0.0
    container_name: allure-report
    ports:
      - "8080:8080"
    volumes:
      - ./allure-results:/app/allure-results:ro
      - ./out:/app/out
      - ./allurerc.mjs:/app/allurerc.mjs:ro
    restart: always
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:8080"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
```
