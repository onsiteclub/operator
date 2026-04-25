const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

config.watchFolders = [
  path.resolve(projectRoot, 'packages', 'auth'),
  path.resolve(projectRoot, 'packages', 'auth-ui'),
  path.resolve(projectRoot, 'packages', 'tokens'),
];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
];

config.resolver.disableHierarchicalLookup = true;

module.exports = config;
