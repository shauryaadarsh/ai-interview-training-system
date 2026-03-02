import { extractQuestionFromTranscript, ExtractedQuestion } from './questionExtractor';
import { extractQuestionLocally, generateSearchQuery } from './localQuestionExtractor';
import { pineconeService, SearchResult } from './pineconeService';
import { webSearchAgent, WebSearchResult } from './simpleWebSearchAgent';

export interface Citation {
  source: string;
  content: string;
  url?: string;
  score: number;
  page?: number;
  startPage?: number;
  endPage?: number;
  filename?: string;
  sourceType: 'pdf' | 'web';
  contextSnippet?: string;
  pageRange?: string;
  contentType?: 'text' | 'image' | 'multimodal';
}

export interface RAGContext {
  pdfResults: SearchResult[];
  webResults: WebSearchResult[];
  combinedContext: string;
  citations: Citation[];
}

export interface RAGResponse {
  extractedQuestion: ExtractedQuestion | null;
  context: RAGContext;
  searchPerformed: boolean;
}

class RAGOrchestrator {

  constructor() {
    console.log("RAG Orchestrator ready");
  }

  async processTranscript(transcript: string, background?: string): Promise<RAGResponse> {
    try {
      console.log('🔍 Extracting question...');

      let extractedQuestion: ExtractedQuestion | null = null;

      try {
        extractedQuestion = await extractQuestionFromTranscript(transcript);
      } catch {
        const local = extractQuestionLocally(transcript);
        if (local) {
          extractedQuestion = {
            question: local.question,
            context: local.context,
            confidence: local.confidence
          };
        }
      }

      const query =
        extractedQuestion?.question ||
        generateSearchQuery(transcript);

      if (!query || query.length < 5) {
        return this.emptyResponse(extractedQuestion);
      }

      const [pdfResults, webResponse] = await Promise.all([
        pineconeService.searchSimilarContent(query, 3).catch(() => []),
        webSearchAgent.searchWeb(query, 3).catch(() => ({ results: [] }))
      ]);

      const context = this.combineContexts(pdfResults, webResponse.results);

      return {
        extractedQuestion,
        context,
        searchPerformed: true
      };

    } catch (error) {
      console.error("RAG error:", error);
      return this.emptyResponse(null);
    }
  }

  private emptyResponse(question: ExtractedQuestion | null): RAGResponse {
    return {
      extractedQuestion: question,
      context: {
        pdfResults: [],
        webResults: [],
        combinedContext: '',
        citations: []
      },
      searchPerformed: false
    };
  }

  private combineContexts(pdfResults: SearchResult[], webResults: WebSearchResult[]): RAGContext {
    const combined = [
      ...pdfResults,
      ...webResults.map(w => ({
        ...w,
        content: w.snippet
      }))
    ];

    const contextText = combined
      .map(r => r.content?.slice(0, 400))
      .join("\n\n");

    const citations: Citation[] = combined.map(r => ({
      source: (r as any).source || (r as any).title || "web",
      content: r.content,
      url: (r as any).link,
      score: r.score || 0.5,
      sourceType: (r as any).link ? 'web' : 'pdf'
    }));

    return {
      pdfResults,
      webResults,
      combinedContext: contextText,
      citations
    };
  }

  // Multimodal disabled safely (no Gemini / HF image model yet)
 async processMultimodalTranscript(
  transcript: string,
  imageFile?: File,
  background?: string
): Promise<RAGResponse> {
    console.log("Multimodal disabled — falling back to text RAG");
    return this.processTranscript(transcript, background);
  }

}

export const ragOrchestrator = new RAGOrchestrator();