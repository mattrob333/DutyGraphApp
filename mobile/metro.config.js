// Metro bundles only the project folder by default. The hands-free deck logic lives in the
// repository's shared/hands-free/ (pure TypeScript, used by the server and the web client too),
// so Metro also watches that one folder. Nothing else outside mobile/ is bundled.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.watchFolders = [...(config.watchFolders || []), path.resolve(__dirname, '../shared/hands-free')];

module.exports = config;
