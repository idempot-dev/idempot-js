import { defineConfig } from "vitepress";

const siteUrl = "https://js.idempot.dev";
const siteName = "idempot-js";
const siteDescription = "Idempotency middleware for Node.js, Bun, and Deno. Supports Express, Fastify, and Hono with pluggable storage backends including Redis, PostgreSQL, MySQL, and SQLite.";

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

export default defineConfig({
  title: "idempot-js",
  description: "Idempotency middlewares for Node.js",
  sitemap: {
    hostname: "https://js.idempot.dev"
  },
  head: [
    // Plausible analytics
    ["script", { defer: true, "data-domain": "js.idempot.dev", src: "https://plausible.io/js/pa-gteedLuTOi5cVRvpZlLtR.js" }],
    [
      "script",
      {},
      "window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init()"
    ],
    // SEO: Meta tags
    ["meta", { name: "robots", content: "index, follow" }],
    ["meta", { name: "author", content: "idempot-dev" }],
    ["meta", { name: "keywords", content: "idempotency, middleware, express, fastify, hono, node.js, bun, deno, redis, postgresql, mysql, sqlite, ietf, retry, duplicate detection" }],
    // Open Graph
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:site_name", content: siteName }],
    ["meta", { property: "og:title", content: siteName }],
    ["meta", { property: "og:description", content: siteDescription }],
    ["meta", { property: "og:url", content: siteUrl }],
    // Twitter Card
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
    ["meta", { name: "twitter:title", content: siteName }],
    ["meta", { name: "twitter:description", content: siteDescription }],
    // Canonical URL (will be overridden per page)
    ["link", { rel: "canonical", href: siteUrl }],
    // Structured Data: Organization
    [
      "script",
      { type: "application/ld+json" },
      JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "idempot-dev",
        url: "https://idempot.dev",
        logo: "https://idempot.dev/logo.png",
        sameAs: [
          "https://github.com/idempot-dev"
        ]
      })
    ],
    // Structured Data: SoftwareApplication
    [
      "script",
      { type: "application/ld+json" },
      JSON.stringify({
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "idempot-js",
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Node.js, Bun, Deno",
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD"
        },
        description: siteDescription,
        url: siteUrl,
        codeRepository: "https://github.com/idempot-dev/idempot-js",
        programmingLanguage: ["JavaScript", "TypeScript"],
        license: "https://github.com/idempot-dev/idempot-js/blob/main/LICENSE"
      })
    ],
    // Structured Data: WebSite
    [
      "script",
      { type: "application/ld+json" },
      JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: siteName,
        url: siteUrl,
        description: siteDescription
      })
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
});
