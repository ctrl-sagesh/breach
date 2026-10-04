import path from 'node:path';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  reactStrictMode: true,
  trailingSlash: true,
  // Relative asset URLs so the export also works from a nested folder (itch.io serves from a CDN subpath).
  assetPrefix: './',
  // Several lockfiles exist above this folder; pin tracing to the project root.
  outputFileTracingRoot: path.resolve('.'),
};

export default nextConfig;
