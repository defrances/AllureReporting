FROM node:20-alpine AS base

RUN apk add --no-cache python3 make g++ wget

WORKDIR /app

RUN corepack enable && corepack prepare yarn@4.5.1 --activate

COPY .yarnrc.yml ./
COPY .yarn/releases ./.yarn/releases
COPY plugin-ci-version.cjs ./
COPY package.json yarn.lock ./
COPY packages ./packages

RUN yarn install --immutable

COPY . .

RUN yarn build

FROM node:20-alpine AS production

WORKDIR /app

RUN corepack enable && corepack prepare yarn@4.5.1 --activate && \
    apk add --no-cache wget

COPY .yarnrc.yml ./
COPY .yarn/releases ./.yarn/releases
COPY plugin-ci-version.cjs ./
COPY package.json yarn.lock ./
COPY packages ./packages

RUN yarn install --immutable

COPY --from=base /app/packages ./packages
COPY --from=base /app/allurerc.mjs ./
COPY --from=base /app/allurerc.gate.mjs ./

RUN mkdir -p /app/allure-results /app/out

EXPOSE 8080

CMD ["sh", "-c", "if [ -d /app/allure-results ] && [ -n \"$(ls -A /app/allure-results 2>/dev/null)\" ]; then yarn allure generate allure-results --config=allurerc.mjs || true; fi && if [ -d /app/out/allure-report ]; then yarn allure open --port 8080 out/allure-report; elif [ -d /app/allure-results ]; then yarn allure open --port 8080 allure-results; else echo 'No report or results found. Please mount allure-results directory or generate a report first.' && sleep infinity; fi"]
