import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  experimental: {
    esmExternals: true,
  },
  webpack: (config, { isServer }) => {
    // For client-side builds, mark Node.js modules as external to prevent bundling
    if (!isServer) {
      config.externals = {
        ...config.externals,
        'onnxruntime-node': 'onnxruntime-node',
        '@huggingface/transformers': '@huggingface/transformers',
        'canvas': 'canvas',
      };

      // Provide fallbacks for some modules
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };
    }

    // Handle .node files
    config.module.rules.push({
      test: /\.node$/,
      use: 'node-loader',
    });

    return config;
  },
  staticPageGenerationTimeout: 1000,
};

export default config;
