
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
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
  private openai: OpenAI;

  constructor() {
    this.indexName = process.env.PINECONE_INDEX_NAME || 'interview-docs';

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

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
      EMBEDDING GENERATION
  =================================*/
  private async generateEmbedding(text: string): Promise<number[]> {
    const response = await this.openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
    });

    return response.data[0].embedding;
  }

  /* ================================
      PDF UPLOAD
  =================================*/
  async uploadPDF(file: File) {
    if (!this.pinecone) return null;

    const buffer = Buffer.from(await file.arrayBuffer());
    const pdfData = await safePdfParse(buffer);

    const index = this.pinecone.index(this.indexName);

    const chunks = pdfData.text.split(/\n+/).filter(c => c.length > 30);

    const vectors = [];

    for (let i = 0; i < chunks.length; i++) {
      const embedding = await this.generateEmbedding(chunks[i]);

      vectors.push({
        id: `${file.name}-${i}`,
        values: embedding,
        metadata: {
          content: chunks[i],
          filename: file.name,
          chunk: i
        }
      });
    }

    await index.upsert(vectors);

    return true;
  }

  /* ================================
      SEARCH
  =================================*/
  async searchSimilarContent(query: string, topK = 5): Promise<SearchResult[]> {
    if (!this.pinecone) return [];

    const embedding = await this.generateEmbedding(query);
    const index = this.pinecone.index(this.indexName);

    const result = await index.query({
      vector: embedding,
      topK,
      includeMetadata: true,
    });

    return (
      result.matches?.map(m => ({
        content: m.metadata?.content || "",
        score: m.score || 0,
        metadata: m.metadata,
        source: `PDF: ${m.metadata?.filename || "unknown"}`
      })) || []
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
      filter: { filename: { $eq: filename } }
    });

    const ids = res.matches?.map(m => m.id) || [];

    if (ids.length > 0) {
      await index.deleteMany(ids);
    }

    return true;
  }
}

export const pineconeService = new PineconeService();

