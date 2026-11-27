import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Vault chat exports are several MB of Markdown.
    serverActions: { bodySizeLimit: "6mb" },
  },
  serverExternalPackages: ["@resvg/resvg-js", "fluent-ffmpeg", "@ffprobe-installer/ffprobe"],
  outputFileTracingIncludes: {
    "/card/[slug]/png": ["./node_modules/@fontsource/inter/files/*.woff", "./node_modules/@fontsource/barlow-condensed/files/*.woff"],
  },
};

export default nextConfig;
