import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // typedRoutes agora é uma opção de nível raiz (não mais dentro de experimental)
  typedRoutes: false,

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.r2.cloudflarestorage.com',
      },
      {
        protocol: 'https',
        hostname: '**.amazonaws.com',
      },
    ],
    formats: ['image/avif', 'image/webp'],
  },
  poweredByHeader: false,
}

export default nextConfig