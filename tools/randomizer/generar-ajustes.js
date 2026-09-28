// Genera un fichero de ajustes .rnqs usando las propias clases del randomizer.
//
// Existe porque los ajustes normalmente se exportan desde la interfaz de
// escritorio, y para probar la integracion hace falta uno sin abrirla. Tambien
// sirve de punto de partida para quien no tenga ninguno.
//
// Uso (Java 8 trae jjs en la JRE):
//   jjs -cp tools/randomizer/PokeRandoZX.jar tools/randomizer/generar-ajustes.js -- <salida.rnqs>

var Settings = Java.type('com.dabomstew.pkrandom.Settings');
var CustomNamesSet = Java.type('com.dabomstew.pkrandom.CustomNamesSet');
var ExpCurve = Java.type('com.dabomstew.pkrandom.pokemon.ExpCurve');
var FileOutputStream = Java.type('java.io.FileOutputStream');

// jjs deja los argumentos posteriores a -- en el global `arguments`.
var destino = arguments.length > 0 ? arguments[0] : 'ajustes.rnqs';
var s = new Settings();

// Los setters reciben un boolean[] que representa los botones de opcion de la
// interfaz: la primera posicion en true es la opcion elegida, y todo en false
// significa "sin cambios".
var bools = function () {
  return Java.to(Array.prototype.slice.call(arguments), 'boolean[]');
};

// Un Settings recien creado deja cuatro campos a null que la interfaz de
// escritorio rellena por su cuenta, y al guardar revienta con NullPointer.
// Los completamos aqui con valores neutros.
s.setCustomNames(new CustomNamesSet());
s.setRomName('');
s.setSelectedEXPCurve(ExpCurve.MEDIUM_FAST);

// Pokemon salvajes aleatorios y elegir inicial aleatorio: suficiente para que
// la ROM resultante sea claramente distinta de la original.
s.setWildPokemonMod(bools(true, false, false));
s.setStartersMod(bools(false, true, false));

var out = new FileOutputStream(destino);
try {
  s.write(out);
} finally {
  out.close();
}
print('ajustes escritos en ' + destino);
