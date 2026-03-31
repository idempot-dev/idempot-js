import { defineConfig } from "vitepress";

export default defineConfig({
  title: "idempot-js",
  description: "Idempotency middlewares for Node.js",
  head: [
    ["script", { defer: true, "data-domain": "js.idempot.dev" }]
  ],
  themeConfig: {
    nav: [
      { text: "Home", link: "/" },
      { text: "Getting Started", link: "/getting-started/installation" }
    ],
    sidebar: [
      {
        text: "Getting Started",
        items: [
          { text: "Installation", link: "/getting-started/installation" },
          { text: "Quick Start", link: "/getting-started/quick-start" }
        ]
      },
      {
        text: "Frameworks",
        items: [
          { text: "Express", link: "/frameworks/express" },
          { text: "Fastify", link: "/frameworks/fastify" },
          { text: "Hono", link: "/frameworks/hono" }
        ]
      },
      {
        text: "Stores",
        items: [
          { text: "Redis", link: "/stores/redis" },
          { text: "PostgreSQL", link: "/stores/postgres" },
          { text: "MySQL", link: "/stores/mysql" },
          { text: "SQLite", link: "/stores/sqlite" },
          { text: "Bun SQL", link: "/stores/bun-sql" }
        ]
      },
      {
        text: "Reference",
        items: [
          { text: "Core", link: "/reference/core" }
        ]
      }
    ],
    socialLinks: [
      { icon: "github", link: "https://github.com/idempot-dev/idempot-js" }
    ]
  }
});