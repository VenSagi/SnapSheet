/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    // Konva tries to load 'canvas' (Node-only); stub it for client, externalize for server
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push({ canvas: "commonjs canvas" });
    } else {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        canvas: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
