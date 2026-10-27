// Both roles share deterministic rules with the development API. Watch shared source;
// provider implementations and server credentials remain outside the bundle graph.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.watchFolders = [
  ...(config.watchFolders || []),
  path.resolve(__dirname, "../shared"),
];

module.exports = config;
