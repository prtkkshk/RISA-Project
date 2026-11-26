import type { NextConfig } from "next";
const config: NextConfig = {
  outputFileTracingIncludes: { "/api/reset": ["./db/**/*"] },
  serverExternalPackages: ["pg"],
};
export default config;
