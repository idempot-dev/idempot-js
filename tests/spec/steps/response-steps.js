import { Then } from "@cucumber/cucumber";

Then("the response status should be {int}", function (status) {
  if (!this.lastResponse) {
    throw new Error("No response recorded");
  }
  if (this.lastResponse.status !== status) {
    throw new Error(
      `Expected status ${status}, got ${this.lastResponse.status}`
    );
  }
});

Then("the response content-type should be {string}", function (contentType) {
  if (!this.lastResponse) {
    throw new Error("No response recorded");
  }
  const responseContentType = this.lastResponse.headers["content-type"];
  if (!responseContentType?.includes(contentType)) {
    throw new Error(
      `Expected content-type to include "${contentType}", got "${responseContentType}"`
    );
  }
});

Then(
  "the response should have header {string} with value {string}",
  function (headerName, value) {
    if (!this.lastResponse) {
      throw new Error("No response recorded");
    }
    const headerValue = this.lastResponse.headers[headerName.toLowerCase()];
    if (headerValue !== value) {
      throw new Error(
        `Expected header "${headerName}" to be "${value}", got "${headerValue}"`
      );
    }
  }
);

Then("the response body should contain {string}", function (text) {
  if (!this.lastResponse) {
    throw new Error("No response recorded");
  }
  const bodyStr = JSON.stringify(this.lastResponse.body);
  if (!bodyStr.includes(text)) {
    throw new Error(
      `Expected response body to contain "${text}", got: ${bodyStr}`
    );
  }
});
