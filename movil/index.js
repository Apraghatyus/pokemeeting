/**
 * @format
 */

// Primero de todo: el codigo compartido con la web usa localStorage.
import './src/almacen';
import './src/texto';
import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';

AppRegistry.registerComponent(appName, () => App);
