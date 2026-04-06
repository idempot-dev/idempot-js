import http from "http";

export async function makeRequest(port, options) {
  return new Promise((resolve, reject) => {
    const headers = {
      "content-type": "application/json",
      ...options.headers
    };
    if (options.idempotencyKey !== undefined) {
      headers["idempotency-key"] = options.idempotencyKey;
    }

    const req = http.request(
      {
        hostname: "localhost",
        port,
        path: "/api",
        method: "POST",
        headers
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          // Parse JSON if content-type indicates JSON
          const contentType = res.headers["content-type"] || "";
          const isJson =
            contentType.includes("application/json") ||
            contentType.includes("application/problem+json");
          const body = isJson ? JSON.parse(data) : data;
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body
          });
        });
      }
    );
    req.on("error", reject);
    req.write(JSON.stringify(options.body));
    req.end();
  });
}

export async function makeRequestWithoutKey(port, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "localhost",
        port,
        path: "/api",
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...headers
        }
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          // Parse JSON if content-type indicates JSON
          const contentType = res.headers["content-type"] || "";
          const isJson =
            contentType.includes("application/json") ||
            contentType.includes("application/problem+json");
          const parsedBody = isJson ? JSON.parse(data) : data;
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: parsedBody
          });
        });
      }
    );
    req.on("error", reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}
