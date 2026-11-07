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
    content.includes("packages/*"),
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
  const stores = ["redis", "postgres", "sqlite", "mysql", "bun-sql"];

  for (const store of stores) {
    const storeDir = join(rootDir, "packages", "stores", store);
    t.ok(existsSync(storeDir), `packages/stores/${store} directory exists`);
    t.ok(
      existsSync(join(storeDir, "package.json")),
      `packages/stores/${store}/package.json exists`
    );
    // redis uses node-redis.js, mysql uses node-mysql.js, others use index.js
    const mainFile =
      store === "redis"
        ? "node-redis.js"
        : store === "mysql"
          ? "node-mysql.js"
          : "index.js";
    t.ok(
      existsSync(join(storeDir, mainFile)),
      `packages/stores/${store}/${mainFile} exists`
    );
  }
});

test("packages install the same client version as the root", async (t) => {
  // Each consumer package declares its framework or database client as a peer,
  // so pnpm resolves that peer separately from the root devDependency. A peer
  // range such as ">=4.0.0" never changes, so its pin does not move when
  // Dependabot bumps the root: the package's own test suite then runs an older
  // client than the integration suite.
  const consumers = {
    "packages/frameworks/hono": "hono",
    "packages/frameworks/express": "express",
    "packages/frameworks/fastify": "fastify",
    "packages/stores/postgres": "pg",
    "packages/stores/mysql": "mysql2"
  };

  for (const [pkgDir, dep] of Object.entries(consumers)) {
    const readVersion = (base) => {
      const manifestPath = join(base, "node_modules", dep, "package.json");
      return existsSync(manifestPath)
        ? JSON.parse(readFileSync(manifestPath, "utf-8")).version
        : null;
    };

    const rootVersion = readVersion(rootDir);
    const pkgVersion = readVersion(join(rootDir, pkgDir));

    t.ok(rootVersion, `${dep} is installed at the root`);
    t.equal(
      pkgVersion,
      rootVersion,
      `${pkgDir} runs ${dep} ${rootVersion}, the version the root installs`
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
    "packages/stores/mysql",
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
