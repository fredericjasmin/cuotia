const nextConfig = {
  experimental: { cpus: 1 },
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
