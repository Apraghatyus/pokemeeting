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

// Un Settings recien creado deja cuatro campos a null que la interfaz de
// escritorio rellena por su cuenta, y al guardar revienta con NullPointer.
// Los completamos aqui con valores neutros.
s.setCustomNames(new CustomNamesSet());
s.setRomName('');
s.setSelectedEXPCurve(ExpCurve.MEDIUM_FAST);

/**
 * Los setters reciben un boolean[] donde **la posicion es el ordinal del
 * enum**, y la posicion 0 es siempre UNCHANGED.
 *
 * Esto no es evidente y es facil equivocarse: poner true en la posicion 0
 * significa "no cambiar nada", no "la primera opcion". Un ejemplo anterior
 * ponia true en la 0 creyendo elegir la primera opcion y salia una ROM sin
 * aleatorizar, ademas de unos iniciales personalizados sin sentido.
 */
var elegir = function (indice, total) {
  var flags = [];
  for (var i = 0; i < total; i++) flags.push(i === indice);
  return Java.to(flags, 'boolean[]');
};

// WildPokemonMod:   0=UNCHANGED 1=RANDOM 2=AREA_MAPPING 3=GLOBAL_MAPPING
s.setWildPokemonMod(elegir(1, 4));

// StartersMod:      0=UNCHANGED 1=CUSTOM 2=COMPLETELY_RANDOM 3=RANDOM_WITH_TWO_EVOLUTIONS
s.setStartersMod(elegir(2, 4));

// TrainersMod:      0=UNCHANGED 1=RANDOM 2=DISTRIBUTED ...
s.setTrainersMod(elegir(1, 6));

// MovesetsMod:      0=UNCHANGED 1=RANDOM_PREFER_SAME_TYPE 2=COMPLETELY_RANDOM 3=METRONOME_ONLY
// Se prefiere el que respeta el tipo: aleatorio del todo hace la partida
// bastante ingobernable.
s.setMovesetsMod(elegir(1, 4));

var out = new FileOutputStream(destino);
try {
  s.write(out);
} finally {
  out.close();
}
print('ajustes escritos en ' + destino);
print('  Pokemon salvajes : aleatorios');
print('  Iniciales        : aleatorios');
print('  Entrenadores     : aleatorios');
print('  Movimientos      : aleatorios respetando el tipo');
