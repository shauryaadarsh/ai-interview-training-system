import { Pinecone } from '@pinecone-database/pinecone';
import { safePdfParse } from '../safePdfParse';

export interface SearchResult {
  content: string;
  score: number;
  metadata: any;
  source: string;
  page?: number;
  startPage?: number;
  endPage?: number;
}

class PineconeService {
  private pinecone: Pinecone | null = null;
  private indexName: string;

  constructor() {
    this.indexName = process.env.PINECONE_INDEX_NAME || 'interview-docs';

    if (process.env.PINECONE_API_KEY) {
      this.pinecone = new Pinecone({
        apiKey: process.env.PINECONE_API_KEY,
      });
      console.log("✅ Pinecone initialized");
    } else {
      console.warn("⚠️ Pinecone disabled — no API key");
    }
  }

  /* ================================
      FAKE EMBEDDING (no external API)
  =================================*/
  private async generateEmbedding(text: string): Promise<number[]> {
    const vec = new Array(384).fill(0);
    for (let i = 0; i < Math.min(text.length, 384); i++) {
      vec[i] = text.charCodeAt(i) / 255;
    }
    return vec;
  }

  /* ================================
      PDF UPLOAD
  =================================*/
  async uploadPDF(file: File): Promise<boolean | null> {
    if (!this.pinecone) return null;

    const buffer = Buffer.from(await file.arrayBuffer());
    const pdfData = await safePdfParse(buffer);

    const index = this.pinecone.index(this.indexName);

    const chunks: string[] = pdfData.text
      .split(/\n+/)
      .map((c: string) => c.trim())
      .filter((c: string) => c.length > 30);

    const vectors: any[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const embedding = await this.generateEmbedding(chunks[i]);

      vectors.push({
        id: `${file.name}-${i}`,
        values: embedding,
        metadata: {
          content: chunks[i],
          filename: file.name,
          chunk: i,
        },
      });
    }

    if (vectors.length > 0) {
      await index.upsert(vectors);
    }

    return true;
  }

  /* ================================
      SEARCH
  =================================*/
  async searchSimilarContent(
    query: string,
    topK = 5
  ): Promise<SearchResult[]> {
    if (!this.pinecone) return [];

    const embedding = await this.generateEmbedding(query);
    const index = this.pinecone.index(this.indexName);

    const result = await index.query({
      vector: embedding,
      topK,
      includeMetadata: true,
    });

    return (
      result.matches?.map((m): SearchResult => ({
        content: String(m.metadata?.content ?? ""),
        score: typeof m.score === "number" ? m.score : 0,
        metadata: m.metadata ?? {},
        source: `PDF: ${String(m.metadata?.filename ?? "unknown")}`,
        page:
          typeof m.metadata?.page === "number"
            ? m.metadata.page
            : undefined,
      })) ?? []
    );
  }

  /* ================================
      DELETE DOCUMENT
  =================================*/
  async deleteDocument(filename: string): Promise<boolean> {
    if (!this.pinecone) return false;

    const index = this.pinecone.index(this.indexName);

    const res = await index.query({
      topK: 10000,
      includeMetadata: true,
      filter: { filename: { $eq: filename } },
    });

    const ids = res.matches?.map(m => m.id).filter(Boolean) || [];

    if (ids.length > 0) {
      await index.deleteMany(ids);
    }

    return true;
  }
}

export const pineconeService = new PineconeService();