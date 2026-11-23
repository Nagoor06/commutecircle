const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// The website serves these ES modules directly. Android bundles the same source.
config.watchFolders.push(path.resolve(__dirname, '../../services/api/app/studio/app/shared'));
module.exports = config;
