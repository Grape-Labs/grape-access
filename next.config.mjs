/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@noble/hashes/sha256": "@noble/hashes/sha2.js",
      "@noble/hashes/utils": "@noble/hashes/utils.js"
    };
    return config;
  }
};

export default nextConfig;
