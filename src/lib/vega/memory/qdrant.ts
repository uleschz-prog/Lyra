import { QdrantClient } from "@qdrant/js-client-rest";

import { VEGA_VECTOR_SIZE, embedText, toPointId } from "./embed";

export type HistoryHit = {
  id: string;
  score: number;
  text: string;
  author: string;
  postedAt: string;
};

export type MemoryPoint = {
  id: string;
  vector: number[];
  payload: Record<string, string>;
};

export interface VectorMemory {
  upsert(points: MemoryPoint[]): Promise<void>;
  search(vector: number[], limit: number, userId: string): Promise<HistoryHit[]>;
}

type QdrantGateway = {
  collectionExists(name: string): Promise<{ exists: boolean }>;
  createCollection(name: string, body: { vectors: { size: number; distance: "Cosine" } }): Promise<unknown>;
  upsert(name: string, body: { wait?: boolean; points: MemoryPoint[] }): Promise<unknown>;
  query(
    name: string,
    body: {
      query: number[];
      limit?: number;
      with_payload?: boolean;
      filter?: { must: Array<{ key: string; match: { value: string } }> };
    },
  ): Promise<{ points: Array<{ id: string | number; score: number; payload?: Record<string, unknown> | null }> }>;
};

export function createQdrantMemory(client: QdrantGateway, collection = "vega_posts"): VectorMemory {
  let ready: Promise<void> | null = null;
  const ensure = () => {
    ready ??= (async () => {
      const exists = await client.collectionExists(collection);
      if (!exists.exists) {
        await client.createCollection(collection, { vectors: { size: VEGA_VECTOR_SIZE, distance: "Cosine" } });
      }
    })();
    return ready;
  };

  return {
    async upsert(points) {
      if (points.length === 0) return;
      await ensure();
      await client.upsert(collection, { wait: true, points });
    },
    async search(vector, limit, userId) {
      await ensure();
      const result = await client.query(collection, {
        query: vector,
        limit,
        with_payload: true,
        filter: { must: [{ key: "userId", match: { value: userId } }] },
      });
      return result.points.map((point) => ({
        id: String(point.id),
        score: point.score,
        text: typeof point.payload?.text === "string" ? point.payload.text : "",
        author: typeof point.payload?.author === "string" ? point.payload.author : "",
        postedAt: typeof point.payload?.postedAt === "string" ? point.payload.postedAt : "",
      }));
    },
  };
}

export function qdrantMemoryFromEnv(env: NodeJS.ProcessEnv = process.env): VectorMemory | null {
  const url = env.QDRANT_URL?.trim();
  if (!url) return null;
  const client = new QdrantClient({ url, apiKey: env.QDRANT_API_KEY?.trim() || undefined, checkCompatibility: false });
  return createQdrantMemory(
    {
      collectionExists: (name) => client.collectionExists(name),
      createCollection: (name, body) => client.createCollection(name, body),
      upsert: (name, body) => client.upsert(name, body),
      query: async (name, body) => {
        const result = await client.query(name, body);
        return {
          points: result.points.map((point) => ({
            id: point.id,
            score: point.score,
            payload: point.payload && typeof point.payload === "object" ? (point.payload as Record<string, unknown>) : null,
          })),
        };
      },
    },
    env.QDRANT_COLLECTION?.trim() || "vega_posts",
  );
}

export function historyPoint(input: { userId: string; profileId: string; externalId: string; text: string; author: string; postedAt: string }): MemoryPoint {
  return {
    id: toPointId(`${input.userId}:${input.externalId}`),
    vector: embedText(input.text),
    payload: {
      userId: input.userId,
      profileId: input.profileId,
      externalId: input.externalId,
      text: input.text.slice(0, 1000),
      author: input.author,
      postedAt: input.postedAt,
    },
  };
}
