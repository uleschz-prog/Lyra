import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@langchain/core",
    "@langchain/langgraph",
    "@qdrant/js-client-rest",
    "@upstash/redis",
    "js-tiktoken",
    "vader-sentiment",
  ],
};

export default nextConfig;
