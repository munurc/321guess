const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Monorepo support (npm workspaces): watch the workspace root so Metro can
// see sibling packages like @321guess/core, and fall back to the hoisted
// root node_modules when resolving. Works locally by accident (Node's
// directory-walking resolution finds the root node_modules on its own),
// but a sandboxed CI build scoped to this directory (e.g. Vercel with
// "Root Directory: apps/web") needs it spelled out explicitly.
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = withNativeWind(config, { input: "./src/global.css" });
