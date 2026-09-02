"use client";

import { getSession } from "@/src/wren/session";

/** Importing this from the root layout starts WebMCP registration at module eval, before Game mounts. */
getSession();

export function WebmcpBoot() {
  getSession();
  return null;
}
