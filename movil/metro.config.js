// Metro, el empaquetador de React Native.
//
// La app vive fuera de los workspaces de la web a proposito -React Native trae
// su propio React, de otra version- pero comparte lo que sabe del juego. Eso
// esta en packages/ y en un par de ficheros de apps/web que no dependen del
// navegador. Se le dice a Metro que mire ahi y como se llaman.
const path = require('path');
// La de Expo: la usan `expo start` (el dev client) y el empaquetado de la APK.
const {getDefaultConfig} = require('expo/metro-config');

const raiz = path.resolve(__dirname, '..');

const config = getDefaultConfig(__dirname);

config.watchFolders = [path.join(raiz, 'packages'), path.join(raiz, 'apps/web/src/core')];
Object.assign(config.resolver, {
  extraNodeModules: {
    '@emupoke/pokemon': path.join(raiz, 'packages/pokemon'),
    '@emupoke/protocol': path.join(raiz, 'packages/protocol'),
  },
  // Los paquetes compartidos no tienen node_modules propios: lo que importen
  // se busca en los de la app, y SOLO ahi. Sin cortar la busqueda hacia
  // arriba, el codigo de apps/web encontraria el React de la web en la raiz
  // y la app llevaria dos Reacts: los hooks fallan en cuanto se mezclan.
  nodeModulesPaths: [path.join(__dirname, 'node_modules')],
  disableHierarchicalLookup: true,
});

module.exports = config;
