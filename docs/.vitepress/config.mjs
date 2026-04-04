import { defineConfig } from "vitepress";
import { withMermaid } from "vitepress-plugin-mermaid";

const docsSidebar = [
  {
    text: "Guide",
    items: [
      { text: "Overview", link: "/guide/" },
      { text: "Installation", link: "/guide/installation" },
      { text: "Configuration", link: "/guide/configuration" }
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
    items: [{ text: "Core", link: "/reference/core" }]
  }
];

export default withMermaid(
  defineConfig({
    title: "idempot-js",
    description: "Idempotency middlewares for Node.js",
    sitemap: {
      hostname: "https://js.idempot.dev"
    },
    markdown: {
      mermaid: true
    },
    vite: {
      optimizeDeps: {
        include: [
          "debug"
        ]
      }
    },
    head: [
    ["script", { defer: true, "data-domain": "js.idempot.dev", src: "https://plausible.io/js/pa-gteedLuTOi5cVRvpZlLtR.js" }],
    [
      "script",
      {},
      "window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init()"
    ]
  ],
  themeConfig: {
    nav: [
      { text: "Learn", link: "https://idempot.dev/learn/" },
      { text: "Guide", link: "/guide/" }
    ],
    sidebar: {
      "/guide/": docsSidebar,
      "/frameworks/": docsSidebar,
      "/stores/": docsSidebar,
      "/reference/": docsSidebar
    },
    socialLinks: [{ icon: "github", link: "https://github.com/idempot-dev/idempot-js" }],
    footer: {
      message: 'Part of the <a href="https://idempot.dev">idempot.dev</a> ecosystem · Released under the <a href="https://github.com/idempot-dev/idempot-js/blob/main/LICENSE">BSD License</a>.',
      copyright: 'Copyright © 2026 <a href="https://github.com/mroderick">Morgan Roderick</a> and contributors'
    }
  }
})
);