const nextConfig = {
  experimental: { cpus: 1 },
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        // Nobody may embed Cuotia in a frame (prevents clickjacking of wallet actions).
        { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      ],
    }];
  },
  async redirects() {
    return [
      { source: '/circulos', destination: '/circles', permanent: true },
      { source: '/circulos/:path*', destination: '/circles/:path*', permanent: true },
      { source: '/crear', destination: '/create', permanent: true },
      { source: '/panel', destination: '/dashboard', permanent: true },
      { source: '/como-funciona', destination: '/how-it-works', permanent: true },
    ];
  },
};

export default nextConfig;
