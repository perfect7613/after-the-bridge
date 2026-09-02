import type { NextConfig } from "next";

/**
 * WebMCP is origin-isolated and gated by the `tools` Permissions-Policy.
 * `Origin-Agent-Cluster: ?0` disables it; `?1` keeps the document origin-keyed
 * so ChatGPT's in-app browser and Chrome can attach `document.modelContext`.
 * Do not add COEP/COOP here — Happy Oyster's WebRTC stream would break.
 */
const webmcpHeaders = [
  { key: "Origin-Agent-Cluster", value: "?1" },
  { key: "Permissions-Policy", value: "tools=(self)" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  agentRules: false,
  async headers() {
    return [
      { source: "/", headers: webmcpHeaders },
      { source: "/:path*", headers: webmcpHeaders },
    ];
  },
};

export default nextConfig;
