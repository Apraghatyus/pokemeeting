// Aleatorizar con una semilla elegida por nosotros.
//
// Su linea de ordenes no deja fijarla: escoge una al azar cada vez y solo la
// cuenta despues, en el registro. Para este proyecto eso no vale, porque la
// semilla es lo que permite rehacer mas tarde la misma copia exacta en vez de
// tener que guardarla o descargarla.
//
// La solucion es llamar a la misma clase que usa su interfaz, `Randomizer`,
// que si acepta una semilla. Se hace desde jjs, el motor de scripts que ya
// viene con Java y que este servicio usa para construir los ajustes. El jar
// sigue siendo un programa de otra gente que se llama desde fuera y que nunca
// se distribuye con este proyecto.
//
// Comprobado: con la misma ROM, los mismos ajustes y la misma semilla, la ROM
// que sale es identica byte a byte. Con otra semilla, distinta.

/**
 * Guion que aleatoriza con una semilla dada.
 *
 * Reproduce la misma secuencia que su linea de ordenes: buscar que generacion
 * reconoce la ROM, cargarla, ajustar los ajustes a esa ROM y aleatorizar.
 *
 * Escribe en la salida estandar la semilla y la cadena de ajustes, que juntas
 * son la receta para rehacer esta misma copia mas adelante.
 */
export const buildRandomizeScript = (): string => `var Settings = Java.type('com.dabomstew.pkrandom.Settings');
var Randomizer = Java.type('com.dabomstew.pkrandom.Randomizer');
var RandomSource = Java.type('com.dabomstew.pkrandom.RandomSource');
var FileInputStream = Java.type('java.io.FileInputStream');
var File = Java.type('java.io.File');
var ResourceBundle = Java.type('java.util.ResourceBundle');
var PrintStream = Java.type('java.io.PrintStream');
var ByteArrayOutputStream = Java.type('java.io.ByteArrayOutputStream');
var Files = Java.type('java.nio.file.Files');
var Paths = Java.type('java.nio.file.Paths');

var entrada = arguments[0];
var ficheroAjustes = arguments[1];
var salida = arguments[2];
var semilla = arguments[3];

// Solo las generaciones que corren en este proyecto. La lista se recorre en
// orden y gana la primera que reconozca el fichero, igual que hace su CLI.
var FABRICAS = [
  'com.dabomstew.pkrandom.romhandlers.Gen1RomHandler$Factory',
  'com.dabomstew.pkrandom.romhandlers.Gen2RomHandler$Factory',
  'com.dabomstew.pkrandom.romhandlers.Gen3RomHandler$Factory'
];

var ajustes = Settings.read(new FileInputStream(ficheroAjustes));
var ruta = new File(entrada).getAbsolutePath();

var manejador = null;
for (var i = 0; i < FABRICAS.length; i++) {
  var Fabrica = Java.type(FABRICAS[i]);
  var fabrica = new Fabrica();
  if (fabrica.isLoadable(ruta)) {
    manejador = fabrica.create(RandomSource.instance());
    break;
  }
}
if (manejador === null) {
  print('ERROR: ninguna generacion reconoce esa ROM');
  exit(1);
}

manejador.loadRom(ruta);
ajustes.tweakForRom(manejador);

var registro = new ByteArrayOutputStream();
var log = new PrintStream(registro, true, 'UTF-8');

// El paquete de textos hay que pedirlo con el cargador de clases del propio
// jar: bajo jjs el cargador por omision no lo encuentra y revienta.
var textos = ResourceBundle.getBundle(
  'com/dabomstew/pkrandom/newgui/Bundle',
  java.util.Locale.getDefault(),
  Settings.class.getClassLoader()
);

var randomizer = new Randomizer(ajustes, manejador, textos, false);
randomizer.randomize(new File(salida).getAbsolutePath(), log, java.lang.Long.parseLong(semilla));
log.close();

// El registro se deja junto a la salida, que es de donde el servicio saca el
// resumen de lo que ha cambiado.
Files.write(Paths.get(salida + '.log'), registro.toByteArray());

print('SEMILLA:' + semilla);
print('AJUSTES:' + ajustes.toString());
`;

/**
 * Guion que reconstruye un fichero de ajustes desde su cadena.
 *
 * Es el camino de vuelta de `ajustes.toString()`, y sirve para rehacer una
 * partida que se creo con un fichero .rnqs traido de fuera, del que no
 * guardamos copia.
 */
export const buildFromStringScript = (): string => `var Settings = Java.type('com.dabomstew.pkrandom.Settings');
var CustomNamesSet = Java.type('com.dabomstew.pkrandom.CustomNamesSet');
var FileOutputStream = Java.type('java.io.FileOutputStream');

var ajustes = Settings.fromString(arguments[0]);
// Un Settings recien leido de una cadena no trae los nombres propios, y al
// guardarlo sin ellos revienta.
ajustes.setCustomNames(new CustomNamesSet());

var out = new FileOutputStream(arguments[1]);
try { ajustes.write(out); } finally { out.close(); }
`;
