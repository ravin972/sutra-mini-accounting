/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: '/',
        destination: '/sync',
        permanent: false,
      },
    ];
  },
};

module.exports = nextConfig;
