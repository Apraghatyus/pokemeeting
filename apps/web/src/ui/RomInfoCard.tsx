import type { PlatformDescriptor } from '../core/platforms';
import type { RomHeader } from '../core/romHeader';

type Props = {
  header: RomHeader;
  platform: PlatformDescriptor;
  romName: string;
};

/** Ficha de la ROM cargada. El crc32 es lo que compararemos entre jugadores. */
export const RomInfoCard = ({ header, platform, romName }: Props) => (
  <section className="panel">
    <h2>ROM cargada</h2>
    <dl className="kv">
      <dt>Fichero</dt>
      <dd title={romName}>{romName}</dd>
      <dt>Titulo interno</dt>
      <dd>{header.title}</dd>
      <dt>Plataforma</dt>
      <dd>{platform.label}</dd>
      <dt>Codigo de juego</dt>
      <dd>
        {header.gameCode} <span className="muted">rev {header.version}</span>
      </dd>
      <dt>CRC32</dt>
      <dd className="mono">{header.crc32}</dd>
      <dt>Tamano</dt>
      <dd>{(header.size / 1024 / 1024).toFixed(0)} MB</dd>
    </dl>
  </section>
);
