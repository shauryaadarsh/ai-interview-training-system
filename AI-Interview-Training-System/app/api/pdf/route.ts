import { NextRequest, NextResponse } from "next/server";
import { Pinecone } from "@pinecone-database/pinecone";
import { safePdfParse } from "../../../lib/safePdfParse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function uploadPDFToVectorDB(file: File): Promise<boolean> {
  try {
    if (!process.env.PINECONE_API_KEY) {
      console.warn("Pinecone API key not configured");
      return false;
    }

    const pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
    });

    // Parse PDF
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const pdfData = await safePdfParse(buffer);

    const chunks = splitIntoChunks(pdfData.text, 500);

    const indexName = process.env.PINECONE_INDEX_NAME || "interview-docs";
    const index = pinecone.index(indexName);

    const vectors = [];

    console.log("📄 Uploading text chunks to Pinecone...");

    for (let i = 0; i < chunks.length; i++) {
      // simple dummy embedding (random vector)
      const fakeVector = Array.from({ length: 768 }, () => Math.random());

      vectors.push({
        id: `${file.name}-chunk-${i}`,
        values: fakeVector,
        metadata: {
          content: chunks[i],
          filename: file.name,
          chunkIndex: i,
          title: file.name.replace(".pdf", ""),
          uploadDate: new Date().toISOString(),
          contentType: "text",
        },
      });
    }

    await index.upsert(vectors);
    return true;
  } catch (error) {
    console.error("Error uploading PDF:", error);
    return false;
  }
}

function splitIntoChunks(text: string, chunkSize: number): string[] {
  const words = text.split(" ");
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += chunkSize) {
    chunks.push(words.slice(i, i + chunkSize).join(" "));
  }
  return chunks;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "Only PDF files allowed" }, { status: 400 });
    }

    const success = await uploadPDFToVectorDB(file);

    if (success) {
      return NextResponse.json({
        message: "PDF uploaded successfully",
        filename: file.name,
      });
    } else {
      return NextResponse.json({ error: "Failed to upload PDF" }, { status: 500 });
    }
  } catch (error) {
    console.error("PDF upload error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
