import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/localapp',
        destination: 'http://192.168.1.13:23504',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
