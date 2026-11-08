// Extends app.json. EXPO_BASE_URL lets the web build be hosted under a sub-path, for example
// EXPO_BASE_URL=/app when the website serves the app at /app/ (see website/README.md).
module.exports = ({ config }) => ({
  ...config,
  experiments: {
    ...config.experiments,
    ...(process.env.EXPO_BASE_URL ? { baseUrl: process.env.EXPO_BASE_URL } : {}),
  },
});
