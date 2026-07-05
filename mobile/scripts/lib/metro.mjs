import http from "node:http";

const METRO_READY_TIMEOUT_MS = 45_000;
const METRO_STATUS_HOSTS = Object.freeze(["127.0.0.1", "localhost"]);

export async function waitForMetroReady(port) {
  const deadline = Date.now() + METRO_READY_TIMEOUT_MS;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const status = await readMetroStatus(port);
      if (status.trim() === "packager-status:running") {
        return;
      }
      lastError = new Error(`unexpected status: ${status.trim() || "empty response"}`);
    } catch (error) {
      lastError = error;
    }
    await delay(500);
  }
  throw new Error(`Metro did not become ready on port ${port}${lastError ? `: ${lastError.message}` : ""}`);
}

function readMetroStatus(port) {
  return firstSuccessful(METRO_STATUS_HOSTS.map((host) => () => readMetroStatusFromHost(host, port)));
}

async function firstSuccessful(tasks) {
  let lastError = null;
  for (const task of tasks) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("no Metro status hosts configured");
}

function readMetroStatusFromHost(host, port) {
  return new Promise((resolve, reject) => {
    const request = http.get({
      host,
      port,
      path: "/status",
      timeout: 1_500
    }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode || "unknown"}`));
          return;
        }
        resolve(body);
      });
    });
    request.on("error", reject);
    request.on("timeout", () => {
      request.destroy(new Error("request timed out"));
    });
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
