/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  webpack: (config) => {
    // o leitor de PDF (pdfjs) tenta carregar "canvas" do Node; no navegador não precisa
    config.resolve.alias = { ...(config.resolve.alias || {}), canvas: false };
    return config;
  },
};
export default nextConfig;
