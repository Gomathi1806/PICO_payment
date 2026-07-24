import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  /* config options here */
  turbopack: {
    root: path.resolve(__dirname, ".")
  },
  async headers() {
    return [
      {
        // Vercel's CDN adds Access-Control-Allow-Origin: * to statically
        // prerendered pages by default. Coinbase's Onramp security review
        // explicitly rejects wildcard ACAO anywhere on the integration
        // domain, so we override it with the canonical origin on all page
        // routes. Scoped to exclude /api/* on purpose:
        //   - /api/onramp/session and /api/transak/session emit no ACAO
        //     (same-origin only) and must stay that way
        //   - /api/content/[id] is the x402 endpoint whose CORS the
        //     protocol layer manages itself
        source: "/((?!api/).*)",
        headers: [
          {
            key: "Access-Control-Allow-Origin",
            value: "https://picomicropay.nl",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
