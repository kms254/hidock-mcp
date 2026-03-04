#!/usr/bin/env node

import { HiDockDevice } from "./device.js";
import { createAndRunServer } from "./server.js";

const device = new HiDockDevice();

createAndRunServer(device).catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
