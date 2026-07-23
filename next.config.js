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
  // pdfkit (real invoice PDF generation — see lib/invoice-pdf.js) reads its
  // built-in font metrics (.afm) files from disk, relative to its own
  // package directory, at runtime. Webpack's default bundling of API routes
  // inlines the module and loses that relative path, causing an ENOENT for
  // data/Helvetica.afm in the bundled output. Marking it external keeps
  // pdfkit as a normal `require()` against node_modules at runtime instead,
  // so its own file lookups work unmodified — same category of "opt this
  // dependency out of bundling" fix Next.js's own docs recommend for
  // libraries that read files relative to themselves (e.g. sharp, canvas).
  experimental: {
    serverComponentsExternalPackages: ['pdfkit'],
  },
};

module.exports = nextConfig;
