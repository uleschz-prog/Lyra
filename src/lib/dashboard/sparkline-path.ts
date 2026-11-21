/** Curva cúbica monótona (Fritsch–Carlson) para una serie (x, y). */
export function monotoneCurve(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${fmt(points[0].x)} ${fmt(points[0].y)}`;

  const n = points.length;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    const deltaX = points[i + 1].x - points[i].x;
    dx.push(deltaX);
    slope.push(deltaX === 0 ? 0 : (points[i + 1].y - points[i].y) / deltaX);
  }

  const tangent = slope.map((value) => value);
  tangent.push(slope[n - 2] ?? 0);
  tangent[0] = slope[0] ?? 0;
  for (let i = 1; i < n - 1; i += 1) {
    if (slope[i - 1] * slope[i] <= 0) tangent[i] = 0;
    else tangent[i] = (slope[i - 1] + slope[i]) / 2;
  }

  for (let i = 0; i < n - 1; i += 1) {
    if (Math.abs(slope[i]) < 1e-8) {
      tangent[i] = 0;
      tangent[i + 1] = 0;
      continue;
    }
    const a = tangent[i] / slope[i];
    const b = tangent[i + 1] / slope[i];
    const s = a * a + b * b;
    if (s > 9) {
      const factor = 3 / Math.sqrt(s);
      tangent[i] = factor * a * slope[i];
      tangent[i + 1] = factor * b * slope[i];
    }
  }

  let path = `M ${fmt(points[0].x)} ${fmt(points[0].y)}`;
  for (let i = 0; i < n - 1; i += 1) {
    const controlX1 = points[i].x + dx[i] / 3;
    const controlY1 = points[i].y + (tangent[i] * dx[i]) / 3;
    const controlX2 = points[i + 1].x - dx[i] / 3;
    const controlY2 = points[i + 1].y - (tangent[i + 1] * dx[i]) / 3;
    path += ` C ${fmt(controlX1)} ${fmt(controlY1)} ${fmt(controlX2)} ${fmt(controlY2)} ${fmt(points[i + 1].x)} ${fmt(points[i + 1].y)}`;
  }
  return path;
}

function fmt(value: number) {
  return value.toFixed(2);
}
