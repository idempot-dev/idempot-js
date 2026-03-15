import http from "http";

export async function makeRequest(port, options) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "localhost",
        port,
        path: "/api",
        method: "POST",
        headers: {
          "idempotency-key": options.idempotencyKey,
          "content-type": "application/json"
        }
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: JSON.parse(data)
          });
        });
      }
    );
    req.on("error", reject);
    req.write(JSON.stringify(options.body));
    req.end();
  });
}
