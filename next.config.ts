import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  typedRoutes: false,

  images: {
    remotePatterns: [
      // Domínio do Supabase Storage (bucket público)
      {
        protocol: 'https',
        hostname: 'fydorsylrlpqrylrxmfk.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      // Para desenvolvimento local (se você ainda usar MinIO ou outro)
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '9000',
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
        port: '9000',
      },
    ],
    formats: ['image/avif', 'image/webp'],
  },

  poweredByHeader: false,
}

export default nextConfig
