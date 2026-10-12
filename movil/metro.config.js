// Metro, el empaquetador de React Native.
//
// La app vive fuera de los workspaces de la web a proposito -React Native trae
// su propio React, de otra version- pero comparte lo que sabe del juego. Eso
// esta en packages/ y en un par de ficheros de apps/web que no dependen del
// navegador. Se le dice a Metro que mire ahi y como se llaman.
const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

const raiz = path.resolve(__dirname, '..');

const config = {
  watchFolders: [path.join(raiz, 'packages'), path.join(raiz, 'apps/web/src/core')],
  resolver: {
    extraNodeModules: {
      '@emupoke/pokemon': path.join(raiz, 'packages/pokemon'),
      '@emupoke/protocol': path.join(raiz, 'packages/protocol'),
    },
    // Los paquetes compartidos no tienen node_modules propios: lo que importen
    // se busca en los de la app.
    nodeModulesPaths: [path.join(__dirname, 'node_modules')],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
