import { defineConfig } from "vitepress";

const learnSidebar = [
  {
    text: "Learn",
    items: [
      { text: "Overview", link: "/learn/" },
      { text: "Why Idempotency", link: "/learn/why" },
      { text: "Duplicated vs Repeated", link: "/learn/duplicated-vs-repeated" },
      { text: "Spec Compliance", link: "/learn/spec" }
    ]
  }
];

const docsSidebar = [
  {
    text: "Guide",
    items: [
      { text: "Overview", link: "/guide/" },
      { text: "Installation", link: "/guide/installation" }
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

export default defineConfig({
  title: "idempot-js",
  description: "Idempotency middlewares for Node.js",
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
      { text: "Learn", link: "/learn/" },
      { text: "Guide", link: "/guide/" }
    ],
    sidebar: {
      "/learn/": learnSidebar,
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
});