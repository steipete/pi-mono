#!/usr/bin/env node

import { register } from "tsx/esm/api";

// Enable TypeScript execution without a build
register();

// Run the CLI from source
await import("../src/cli.ts");
