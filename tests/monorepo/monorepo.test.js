import { test } from "tap";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..", "..");

test("pnpm-workspace.yaml exists and is valid", async (t) => {
  const workspaceFile = join(rootDir, "pnpm-workspace.yaml");

  t.ok(existsSync(workspaceFile), "pnpm-workspace.yaml exists");

  const content = readFileSync(workspaceFile, "utf-8");
  t.ok(
    content.includes("packages:"),
    "workspace config contains packages section"
  );
  t.ok(
    content.includes("'packages/*'"),
    "workspace config includes packages/* pattern"
  );
});

test("core package structure exists", async (t) => {
  const corePackageDir = join(rootDir, "packages", "core");

  t.ok(existsSync(corePackageDir), "packages/core directory exists");
  t.ok(
    existsSync(join(corePackageDir, "package.json")),
    "packages/core/package.json exists"
  );
  t.ok(
    existsSync(join(corePackageDir, "src")),
    "packages/core/src directory exists"
  );
  t.ok(
    existsSync(join(corePackageDir, "tests")),
    "packages/core/tests directory exists"
  );
});

test("framework packages structure exists", async (t) => {
  const frameworks = ["hono", "express", "fastify"];

  for (const framework of frameworks) {
    const frameworkDir = join(rootDir, "packages", "frameworks", framework);
    t.ok(
      existsSync(frameworkDir),
      `packages/frameworks/${framework} directory exists`
    );
    t.ok(
      existsSync(join(frameworkDir, "package.json")),
      `packages/frameworks/${framework}/package.json exists`
    );
    t.ok(
      existsSync(join(frameworkDir, "index.js")),
      `packages/frameworks/${framework}/index.js exists`
    );
    t.ok(
      existsSync(join(frameworkDir, `${framework}-middleware.test.js`)),
      `packages/frameworks/${framework}/${framework}-middleware.test.js exists`
    );
  }
});

test("store packages structure exists", async (t) => {
  const stores = ["redis", "postgres", "sqlite", "bun-sql"];

  for (const store of stores) {
    const storeDir = join(rootDir, "packages", "stores", store);
    t.ok(existsSync(storeDir), `packages/stores/${store} directory exists`);
    t.ok(
      existsSync(join(storeDir, "package.json")),
      `packages/stores/${store}/package.json exists`
    );
    t.ok(
      existsSync(join(storeDir, "index.js")),
      `packages/stores/${store}/index.js exists`
    );
  }
});

test("each package has valid package.json", async (t) => {
  const packageDirs = [
    "packages/core",
    "packages/frameworks/hono",
    "packages/frameworks/express",
    "packages/frameworks/fastify",
    "packages/stores/redis",
    "packages/stores/postgres",
    "packages/stores/sqlite",
    "packages/stores/bun-sql"
  ];

  for (const pkgDir of packageDirs) {
    const packageJsonPath = join(rootDir, pkgDir, "package.json");

    if (!existsSync(packageJsonPath)) {
      t.fail(`${pkgDir}/package.json does not exist`);
      continue;
    }

    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));

    t.ok(packageJson.name, `${pkgDir}: has name field`);
    t.ok(packageJson.version, `${pkgDir}: has version field`);
    t.ok(packageJson.type === "module", `${pkgDir}: is ESM (type: module)`);
    t.ok(packageJson.exports, `${pkgDir}: has exports field`);
    t.ok(packageJson.scripts, `${pkgDir}: has scripts field`);
  }
});
