// ABOUT: Next.js configuration: a static export of the Pages Router site into out/
// ABOUT: externalDir lets webpack compile the engine, which the site imports from ../src

import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'export',
  experimental: { externalDir: true },
};

export default config;
