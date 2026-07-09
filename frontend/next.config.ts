import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle so the Docker runtime image can be slim
  // (no node_modules needed at runtime). See frontend/Dockerfile.
  output: "standalone",
  // Bare hostnames/IPs only — no protocol or port. Lets other devices on the
  // LAN load /_next/* dev resources so the page hydrates and is clickable.
  // Friends connect to this PC's IP, so that IP is the origin to allow.
  allowedDevOrigins: ["192.168.18.3", "192.168.18.*", "192.168.1.*"],
};

export default nextConfig;
