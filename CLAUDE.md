# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Hono-based web application project. Hono is a lightweight web framework for building fast web applications on various JavaScript runtimes. The project uses Node.js as the runtime via `@hono/node-server`.

## Development Commands

**Start development server with hot reload:**
```bash
npm run dev
```

**Build TypeScript to JavaScript:**
```bash
npm run build
```

**Run production build:**
```bash
npm start
```

**Access the application:**
```
http://localhost:3000
```

## Architecture

- **Framework**: Hono v4.11.5 - a small, fast web framework
- **Runtime**: Node.js via `@hono/node-server`
- **Language**: TypeScript with strict mode enabled
- **Module System**: ESM (type: "module" in package.json, NodeNext module resolution)
- **JSX Support**: Configured for Hono's JSX runtime (`hono/jsx`)

## TypeScript Configuration

- Strict mode enabled with `verbatimModuleSyntax` for explicit imports/exports
- Compiled output goes to `./dist` directory
- JSX configured to use Hono's JSX implementation

## Project Structure

- `src/index.ts` - Application entry point with server setup
- Server runs on port 3000 by default
