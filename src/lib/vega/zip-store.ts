/** ZIP sin compresión. Sirve en el navegador y en los tests, sin dependencias. */

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosTime(date: Date) {
  const year = Math.max(1980, date.getUTCFullYear());
  const time = (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2);
  const day = ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate();
  return { time, day };
}

export function zipStore(files: { path: string; content: string }[], now = new Date(Date.UTC(2026, 9, 7, 12, 0, 0))) {
  const encoder = new TextEncoder();
  const stamp = dosTime(now);
  const locals: { name: Uint8Array; data: Uint8Array; crc: number; offset: number }[] = [];
  const chunks: Uint8Array[] = [];
  let offset = 0;

  const push = (chunk: Uint8Array) => {
    chunks.push(chunk);
    offset += chunk.length;
  };

  for (const file of files) {
    const name = encoder.encode(file.path.replace(/\\/g, "/"));
    const data = encoder.encode(file.content);
    const crc = crc32(data);
    const header = new Uint8Array(30);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, stamp.time, true);
    view.setUint16(12, stamp.day, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, data.length, true);
    view.setUint32(22, data.length, true);
    view.setUint16(26, name.length, true);
    locals.push({ name, data, crc, offset });
    push(header);
    push(name);
    push(data);
  }

  const centralStart = offset;
  for (const file of locals) {
    const header = new Uint8Array(46);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x02014b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 20, true);
    view.setUint16(12, stamp.time, true);
    view.setUint16(14, stamp.day, true);
    view.setUint32(16, file.crc, true);
    view.setUint32(20, file.data.length, true);
    view.setUint32(24, file.data.length, true);
    view.setUint16(28, file.name.length, true);
    view.setUint32(42, file.offset, true);
    push(header);
    push(file.name);
  }
  const centralSize = offset - centralStart;
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, locals.length, true);
  endView.setUint16(10, locals.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, centralStart, true);
  push(end);

  const archive = new Uint8Array(offset);
  let cursor = 0;
  for (const chunk of chunks) {
    archive.set(chunk, cursor);
    cursor += chunk.length;
  }
  return archive;
}
