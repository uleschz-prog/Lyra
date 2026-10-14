export type HashtagCount = { tag: string; count: number };

export type AcceleratingTag = {
  tag: string;
  recent: number;
  previous: number;
  acceleration: number;
};

export function acceleratingHashtags(input: {
  recent: HashtagCount[];
  previous: HashtagCount[];
  minRecent?: number;
  minAcceleration?: number;
}): AcceleratingTag[] {
  const minRecent = input.minRecent ?? 3;
  const minAcceleration = input.minAcceleration ?? 1;
  const previous = new Map(input.previous.map((item) => [item.tag, item.count]));
  const found: AcceleratingTag[] = [];
  for (const item of input.recent) {
    const before = previous.get(item.tag) ?? 0;
    if (item.count < minRecent || item.count <= before) continue;
    const acceleration = (item.count - before) / Math.max(before, 1);
    if (acceleration < minAcceleration) continue;
    found.push({ tag: item.tag, recent: item.count, previous: before, acceleration });
  }
  return found.sort((a, b) => b.acceleration - a.acceleration || b.recent - a.recent);
}

export function countHashtags(tags: string[]): HashtagCount[] {
  const counts = new Map<string, number>();
  for (const tag of tags) {
    const key = tag.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].map(([tag, count]) => ({ tag, count }));
}
