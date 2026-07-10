/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable React strict mode for development
  reactStrictMode: true,

  // Enable SWC minification for faster builds
  swcMinify: true,

  // Compress responses with gzip
  compress: true,

  // Enable experimental optimizations
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
  },

  // Configure image optimization
  images: {
    deviceSizes: [640, 768, 1024, 1280],
    formats: ["image/webp"],
  },

  // Enable static rendering where possible
  output: "standalone",

  // Fix workspace root detection
  outputFileTracingRoot: __dirname,
};

module.exports = nextConfig;
