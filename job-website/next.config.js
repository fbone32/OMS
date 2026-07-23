/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // This app receives CV uploads (PDF/Word, capped at 4MB — see
  // lib/validation.js's MAX_CV_BYTES comment for why 4MB rather than the
  // brief's stated 5MB) via a Route Handler reading multipart form data
  // directly, not a Server Action, so Server Actions' bodySizeLimit doesn't
  // apply here — this is just documenting there's nothing to raise.
  eslint: { ignoreDuringBuilds: true },
};

module.exports = nextConfig;
