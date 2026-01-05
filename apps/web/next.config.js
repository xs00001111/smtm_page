/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    dangerouslyAllowSVG: true,
  },
  // Webpack alias to ignore optional Solana modules (EVM-only usage)
  webpack: (config) => {
    config.resolve = config.resolve || {}
    config.resolve.alias = Object.assign({}, config.resolve.alias, {
      '@solana-program/system': false,
      'pino-pretty': false,
    })
    return config
  },
}

module.exports = nextConfig
