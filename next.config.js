/** @type {import('next').NextConfig} */
const nextConfig = {
  // The existing OBA Platform UI is a static, self-booting HTML file (index.html)
  // that loads its own template runtime (support.js) and is NOT a React page —
  // it must be served byte-for-byte as-is. We keep it in /public and rewrite the
  // site root to it so Phase 2-4 screens keep working completely unchanged.
  async rewrites() {
    return [
      { source: '/', destination: '/index.html' },
    ];
  },
};

module.exports = nextConfig;
