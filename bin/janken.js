#!/usr/bin/env node
process.env.JANKEN_INSTALLED = "1";
await import("../src/client.js");
