import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  agentRules: false, // stop `next dev` from auto-writing/upserting AGENTS.md and CLAUDE.md
};

export default nextConfig;
