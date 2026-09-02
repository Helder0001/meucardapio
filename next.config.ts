import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  typedRoutes: false,

  images: {
    remotePatterns: [
      // Domínio do Supabase Storage (bucket público)
      {
        protocol: 'https',
        hostname: process.env.NEXT_PUBLIC_SUPABASE_HOSTNAME || 'localhost',
        pathname: '/storage/v1/object/public/**',
      },
      // Para desenvolvimento local (MinIO ou outro S3 compatível)
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
