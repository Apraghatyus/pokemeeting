import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import type { MgbaModule } from '../core/mgbaCore';

type Props = {
  coreRef: RefObject<MgbaModule | null>;
  /** Si el avance rapido esta puesto, para que el boton lo refleje. */
  avanceRapido: boolean;
  /** Lo enciende y lo apaga. En el movil no hay teclado donde pulsar espacio. */
  onAvanceRapido: () => void;
};

/** Entradas del GBA tal y como las nombra mGBA. */
type GbaInput = 'Up' | 'Down' | 'Left' | 'Right' | 'A' | 'B' | 'L' | 'R' | 'Start' | 'Select';

/**
 * Mando tactil para jugar desde el movil.
 *
 * Habla directamente con el nucleo (buttonPress / buttonUnpress) en vez de
 * simular teclas: SDL solo escucha teclado fisico y un evento de teclado
 * sintetico no lo activaria.
 */
export const TouchControls = ({ coreRef, avanceRapido, onAvanceRapido }: Props) => {
  // Que hay pulsado ahora mismo, para no repetir ordenes al nucleo y para
  // poder soltarlo todo si un gesto se cancela.
  const held = useRef(new Set<GbaInput>());
  const [visible, setVisible] = useState(new Set<GbaInput>());

  const apply = useCallback(
    (next: Set<GbaInput>) => {
      const core = coreRef.current;
      if (!core) return;

      for (const input of next) {
        if (!held.current.has(input)) core.buttonPress(input);
      }
      for (const input of held.current) {
        if (!next.has(input)) core.buttonUnpress(input);
      }
      held.current = next;
      setVisible(new Set(next));
    },
    [coreRef],
  );

  /** Cambia solo las direcciones, dejando intactos A, B y demas. */
  const setDirections = useCallback(
    (directions: GbaInput[]) => {
      const next = new Set([...held.current].filter((i) => !DIRECTIONS.includes(i)));
      for (const d of directions) next.add(d);
      apply(next);
    },
    [apply],
  );

  const setButton = useCallback(
    (input: GbaInput, pressed: boolean) => {
      const next = new Set(held.current);
      if (pressed) next.add(input);
      else next.delete(input);
      apply(next);
    },
    [apply],
  );

  return (
    <div className="pad">
      <DirectionPad onChange={setDirections} active={visible} />

      <div className="pad__face">
        <TouchButton input="B" label="B" onChange={setButton} active={visible} className="btn--b" />
        <TouchButton input="A" label="A" onChange={setButton} active={visible} className="btn--a" />
      </div>

      <div className="pad__shoulders">
        <TouchButton input="L" label="L" onChange={setButton} active={visible} className="btn--wide" />
        <TouchButton input="R" label="R" onChange={setButton} active={visible} className="btn--wide" />
      </div>

      <div className="pad__menu">
        <TouchButton input="Select" label="Select" onChange={setButton} active={visible} className="btn--small" />
        <TouchButton input="Start" label="Start" onChange={setButton} active={visible} className="btn--small" />
        {/* No es una entrada del GBA, asi que no pasa por el nucleo como boton:
            cambia la velocidad. Y es conmutador, porque en una pantalla tactil
            mantener un boton pulsado deja un dedo menos para jugar. */}
        <button
          type="button"
          className={`btn btn--small btn--rapido${avanceRapido ? ' is-active' : ''}`}
          aria-pressed={avanceRapido}
          aria-label={avanceRapido ? 'Quitar avance rapido' : 'Avance rapido'}
          title="Avance rapido"
          onClick={onAvanceRapido}
        >
          ⏩
        </button>
      </div>
    </div>
  );
};

const DIRECTIONS: GbaInput[] = ['Up', 'Down', 'Left', 'Right'];

/** Fraccion del radio por debajo de la cual no se considera que haya direccion. */
const DEADZONE = 0.28;
/** A partir de esta proporcion del eje menor se admite la diagonal. */
const DIAGONAL_RATIO = 0.42;

type PadProps = {
  onChange: (directions: GbaInput[]) => void;
  active: Set<GbaInput>;
};

/**
 * Cruceta con diagonales.
 *
 * No son ocho botones sino una zona continua: se mide donde cae el dedo
 * respecto al centro. Asi se puede pasar de arriba a arriba-derecha deslizando,
 * como en una cruceta de verdad, sin levantar el dedo.
 */
const DirectionPad = ({ onChange, active }: PadProps) => {
  const ref = useRef<HTMLDivElement | null>(null);

  const evaluate = (event: ReactPointerEvent<HTMLDivElement>) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;

    const radius = box.width / 2;
    const dx = (event.clientX - (box.left + radius)) / radius;
    const dy = (event.clientY - (box.top + box.height / 2)) / (box.height / 2);

    if (Math.hypot(dx, dy) < DEADZONE) {
      onChange([]);
      return;
    }

    const directions: GbaInput[] = [];
    const limit = Math.max(Math.abs(dx), Math.abs(dy)) * DIAGONAL_RATIO;
    if (Math.abs(dy) >= limit) directions.push(dy < 0 ? 'Up' : 'Down');
    if (Math.abs(dx) >= limit) directions.push(dx < 0 ? 'Left' : 'Right');
    onChange(directions);
  };

  return (
    <div
      ref={ref}
      className="dpad"
      onPointerDown={(event) => {
        // Capturamos el puntero para seguir recibiendo el movimiento aunque el
        // dedo se salga de la cruceta, y para que llegue el pointerup.
        event.currentTarget.setPointerCapture(event.pointerId);
        evaluate(event);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) evaluate(event);
      }}
      onPointerUp={() => onChange([])}
      onPointerCancel={() => onChange([])}
    >
      <span className={`dpad__arm dpad__arm--up${active.has('Up') ? ' is-held' : ''}`} />
      <span className={`dpad__arm dpad__arm--down${active.has('Down') ? ' is-held' : ''}`} />
      <span className={`dpad__arm dpad__arm--left${active.has('Left') ? ' is-held' : ''}`} />
      <span className={`dpad__arm dpad__arm--right${active.has('Right') ? ' is-held' : ''}`} />
      <span className="dpad__hub" />
    </div>
  );
};

type ButtonProps = {
  input: GbaInput;
  label: string;
  className?: string;
  onChange: (input: GbaInput, pressed: boolean) => void;
  active: Set<GbaInput>;
};

const TouchButton = ({ input, label, className, onChange, active }: ButtonProps) => (
  <button
    type="button"
    className={`btn ${className ?? ''}${active.has(input) ? ' is-held' : ''}`}
    // Sin tabIndex negativo el boton robaria el foco del canvas al pulsarlo.
    tabIndex={-1}
    onPointerDown={(event) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      onChange(input, true);
    }}
    onPointerUp={() => onChange(input, false)}
    onPointerCancel={() => onChange(input, false)}
    // Si el dedo entra pulsado desde otro boton, tambien cuenta.
    onContextMenu={(event) => event.preventDefault()}
  >
    {label}
  </button>
);
