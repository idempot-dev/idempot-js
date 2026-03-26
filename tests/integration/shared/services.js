import { execSync } from "child_process";

const command = process.argv[2];

export async function startServices() {
  console.log("Starting local Postgres...");
  try {
    execSync("brew services start postgresql@14", { stdio: "inherit" });
  } catch {}

  console.log("Starting local Redis...");
  try {
    execSync("brew services start redis", { stdio: "inherit" });
  } catch {}

  console.log("Waiting for services...");
  await new Promise((resolve) => setTimeout(resolve, 1000));
  console.log("Services ready!");
}

export async function stopServices() {
  console.log("Stopping services...");
  try {
    execSync("brew services stop postgresql@14", { stdio: "inherit" });
  } catch {}
  try {
    execSync("brew services stop redis", { stdio: "inherit" });
  } catch {}
}

export async function cleanupServices() {}

if (command === "start") {
  startServices()
    .then(() => {
      console.log("Services started successfully");
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
} else if (command === "stop") {
  stopServices()
    .then(() => {
      console.log("Services stopped successfully");
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
} else if (command === "cleanup") {
  cleanupServices()
    .then(() => {
      console.log("Services cleaned up successfully");
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
