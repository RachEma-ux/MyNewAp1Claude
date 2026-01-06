/**
 * Document Extraction Service
 * Extracts text from various document formats
 */

import * as fs from "fs/promises";
import Papa from "papaparse";

export interface ExtractionResult {
  text: string;
  metadata: {
    format: string;
    pages?: number;
    wordCount: number;
    charCount: number;
  };
}

/**
 * Extract text from PDF files
 * Note: pdf-parse requires actual PDF files, this is a simplified version
 */
async function extractFromPDF(filePath: string): Promise<ExtractionResult> {
  try {
    // In production, use pdf-parse:
    // const pdfParse = require("pdf-parse");
    // const dataBuffer = await fs.readFile(filePath);
    // const data = await pdfParse(dataBuffer);
    // return { text: data.text, metadata: { format: "pdf", pages: data.numpages, ... } };
    
    // For now, return placeholder
    const buffer = await fs.readFile(filePath);
    const text = `[PDF content from ${filePath}]`;
    
    return {
      text,
      metadata: {
        format: "pdf",
        pages: 1,
        wordCount: text.split(/\s+/).length,
        charCount: text.length,
      },
    };
  } catch (error) {
    throw new Error(`Failed to extract PDF: ${error}`);
  }
}

/**
 * Extract text from DOCX files
 * Note: mammoth requires actual DOCX files, this is a simplified version
 */
async function extractFromDOCX(filePath: string): Promise<ExtractionResult> {
  try {
    // In production, use mammoth:
    // const mammoth = require("mammoth");
    // const result = await mammoth.extractRawText({ path: filePath });
    // return { text: result.value, metadata: { format: "docx", ... } };
    
    // For now, return placeholder
    const text = `[DOCX content from ${filePath}]`;
    
    return {
      text,
      metadata: {
        format: "docx",
        wordCount: text.split(/\s+/).length,
        charCount: text.length,
      },
    };
  } catch (error) {
    throw new Error(`Failed to extract DOCX: ${error}`);
  }
}

/**
 * Extract text from TXT files
 */
async function extractFromTXT(filePath: string): Promise<ExtractionResult> {
  try {
    const text = await fs.readFile(filePath, "utf-8");
    
    return {
      text,
      metadata: {
        format: "txt",
        wordCount: text.split(/\s+/).length,
        charCount: text.length,
      },
    };
  } catch (error) {
    throw new Error(`Failed to extract TXT: ${error}`);
  }
}

/**
 * Extract text from CSV files
 */
async function extractFromCSV(filePath: string): Promise<ExtractionResult> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const parsed = Papa.parse(content, { header: true });
    
    // Convert CSV to text representation
    const text = parsed.data
      .map((row: any) => Object.values(row).join(" "))
      .join("\n");
    
    return {
      text,
      metadata: {
        format: "csv",
        wordCount: text.split(/\s+/).length,
        charCount: text.length,
      },
    };
  } catch (error) {
    throw new Error(`Failed to extract CSV: ${error}`);
  }
}

/**
 * Extract text from Markdown files
 */
async function extractFromMarkdown(filePath: string): Promise<ExtractionResult> {
  try {
    const text = await fs.readFile(filePath, "utf-8");
    
    // Remove markdown syntax for plain text
    const plainText = text
      .replace(/^#{1,6}\s+/gm, "") // Remove headers
      .replace(/\*\*(.+?)\*\*/g, "$1") // Remove bold
      .replace(/\*(.+?)\*/g, "$1") // Remove italic
      .replace(/\[(.+?)\]\(.+?\)/g, "$1") // Remove links
      .replace(/`(.+?)`/g, "$1") // Remove inline code
      .replace(/```[\s\S]+?```/g, "") // Remove code blocks
      .trim();
    
    return {
      text: plainText,
      metadata: {
        format: "markdown",
        wordCount: plainText.split(/\s+/).length,
        charCount: plainText.length,
      },
    };
  } catch (error) {
    throw new Error(`Failed to extract Markdown: ${error}`);
  }
}

/**
 * Extract text from a document file
 */
export async function extractDocument(filePath: string, format?: string): Promise<ExtractionResult> {
  // Detect format from file extension if not provided
  if (!format) {
    const ext = filePath.split(".").pop()?.toLowerCase();
    format = ext || "txt";
  }
  
  switch (format.toLowerCase()) {
    case "pdf":
      return await extractFromPDF(filePath);
    
    case "docx":
    case "doc":
      return await extractFromDOCX(filePath);
    
    case "txt":
    case "text":
      return await extractFromTXT(filePath);
    
    case "csv":
      return await extractFromCSV(filePath);
    
    case "md":
    case "markdown":
      return await extractFromMarkdown(filePath);
    
    default:
      throw new Error(`Unsupported document format: ${format}`);
  }
}

/**
 * Extract text from buffer (for uploaded files)
 */
export async function extractFromBuffer(
  buffer: Buffer,
  filename: string
): Promise<ExtractionResult> {
  // Write buffer to temp file
  const tempPath = `/tmp/${Date.now()}-${filename}`;
  await fs.writeFile(tempPath, buffer);
  
  try {
    const result = await extractDocument(tempPath);
    return result;
  } finally {
    // Clean up temp file
    await fs.unlink(tempPath).catch(() => {});
  }
}
