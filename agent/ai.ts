import { UserProfile, JobListing, Answer, ResumeChunk, FAQ } from '../src/shared/types.js';
import { exec } from 'child_process'; // For Ollama version check
import util from 'util';
import fs from 'fs'; // Added for reading PDF files
import { Ollama } from 'ollama';
import dotenv from 'dotenv';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
// Try importing getDocument directly from the main package entry, hoping TS resolves types correctly.
// If DOMMatrix error persists, it means this isn't using the legacy/node build internally.
// import { getDocument } from 'pdfjs-dist'; 
// We will need the types for PDFDocumentProxy, PDFPageProxy etc. If not picked up, may need @types/pdfjs-dist or manual types.

// If worker issues arise in a strict Node environment, you might need to set workerSrc:
// import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.entry'; // CommonJS import for worker
// getDocument({ GlobalWorkerOptions: { workerSrc: pdfjsWorker } }); // This is usually set on global or per getDocument call

// import { createCanvas } from 'canvas'; // For rendering PDF pages to images

import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import OpenAI from "openai"; // Import the raw OpenAI SDK
import path from 'path'; // For path.basename
import { TablesInsert } from '../src/shared/supabase.js'; // Corrected path

dotenv.config();
const execAsync = util.promisify(exec);
const debug = (namespace: string) => (...args: any[]) => console.log(`[${namespace}]`, ...args);
const log = debug('jobot:ai');

// --- AI Provider Configuration ---
const AI_PROVIDER = process.env.AI_PROVIDER || 'openai'; // Default to openai now
// OLLAMA_MODEL is still relevant for general Ollama text generation if AI_PROVIDER is ollama
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2:latest'; 
const OLLAMA_EMBEDDING_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text';
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
// Ensure OPENAI_MODEL_NAME is set to a model that supports direct PDF input like gpt-4o or gpt-4o-mini
const OPENAI_MODEL_NAME = process.env.OPENAI_MODEL_NAME || 'gpt-4o-mini'; 
const OPENAI_EMBEDDING_MODEL_NAME = process.env.OPENAI_EMBEDDING_MODEL_NAME || 'text-embedding-3-small';

log(`AI Provider: ${AI_PROVIDER}`);
log(`OpenAI Model for general tasks (and PDF extraction): ${OPENAI_MODEL_NAME}`);
if (AI_PROVIDER === 'ollama') {
  log(`Ollama Model for general tasks: ${OLLAMA_MODEL}`);
}

let ollamaClient: Ollama | null = null;
let openAIChatCompletionClient: OpenAI | null = null; // For direct SDK calls if needed for PDF
let openAIChatModel: ChatOpenAI | null = null; // Langchain wrapper for general chat
let openAIEmbeddings: OpenAIEmbeddings | null = null;

if (AI_PROVIDER === 'ollama') {
  ollamaClient = new Ollama({ host: OLLAMA_HOST });
  log('Initialized Ollama client.');
} else if (AI_PROVIDER === 'openai') {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key is required when AI_PROVIDER is openai.');
  }
  openAIChatCompletionClient = new OpenAI({ apiKey: OPENAI_API_KEY }); // For direct PDF calls
  openAIChatModel = new ChatOpenAI({ apiKey: OPENAI_API_KEY, modelName: OPENAI_MODEL_NAME }); // For LangChain integration
  openAIEmbeddings = new OpenAIEmbeddings({ apiKey: OPENAI_API_KEY, modelName: OPENAI_EMBEDDING_MODEL_NAME });
  log('Initialized OpenAI clients (raw SDK client and LangChain ChatModel/Embeddings).');
} else {
  // If AI_PROVIDER is something else, and it's not 'openai', PDF extraction won't work.
  // For now, we let it be, but extractTextFromPdfViaMultimodal will handle it.
  log(`Warning: AI_PROVIDER is set to '${AI_PROVIDER}'. PDF extraction will only work if it's 'openai'.`);
}

async function ensureOllamaInstalled(): Promise<void> {
  // This function is only relevant if Ollama is a possible provider for some operations.
  if (AI_PROVIDER !== 'ollama' || !ollamaClient) return;
  try {
    await ollamaClient.list();
    log('Ollama connection OK');
  } catch (err: any) {
    log('Ollama API error:', err.message);
    try {
      await execAsync('ollama --version');
      throw new Error('Ollama is installed but unreachable. Ensure it is running.');
    } catch {
      throw new Error('Ollama not installed or not running.');
    }
  }
}

export async function getEmbedding(text: string): Promise<number[]> {
  if (AI_PROVIDER === 'ollama') {
    await ensureOllamaInstalled();
    if (!ollamaClient) throw new Error('Ollama client not initialized for getEmbedding.');
    const resp = await ollamaClient.embeddings({ model: OLLAMA_EMBEDDING_MODEL, prompt: text });
    return resp.embedding;
  }
  // OpenAI provider path
  if (!openAIEmbeddings) throw new Error('OpenAI Embeddings client not initialized.');
  const embedding = await openAIEmbeddings.embedQuery(text);
  return embedding;
}

async function queryResumeChunks(userId: string, questionVector: number[]): Promise<Pick<ResumeChunk,'content'>[]> {
  await new Promise(r => setTimeout(r, 50));
  return [{ content: "Placeholder: Experienced software engineer with a passion for AI." }];
}

async function queryFaqChunks(_: number[]): Promise<Pick<FAQ,'question'|'answer'>[]> {
  await new Promise(r => setTimeout(r, 50));
  return [{ question: "Placeholder: What are your strengths?", answer: "Placeholder: Problem-solving and adaptability." }];
}

/**
 * General purpose generative model call, typically used by generateAnswers, generateCoverLetter.
 * For PDF extraction with OpenAI, extractTextFromPdfViaMultimodal uses a more direct SDK call.
 */
async function callGenerativeModel(
  input: string | { role: string; content: any }[], 
  base64Images?: string[] 
): Promise<string> {
  if (AI_PROVIDER === 'ollama') {
    await ensureOllamaInstalled();
    if (!ollamaClient) throw new Error('Ollama client not initialized for callGenerativeModel.');
    
    let promptText = "";
    if (typeof input === 'string') {
      promptText = input;
    } else if (Array.isArray(input) && input.length > 0) {
        const userMessage = input.find(m => m.role === 'user');
        if (userMessage && typeof userMessage.content === 'string') {
            promptText = userMessage.content;
        } else if (userMessage && Array.isArray(userMessage.content)) {
            const textPart = userMessage.content.find(c => c.type === 'text');
            if (textPart && typeof textPart.text === 'string') promptText = textPart.text;
        } else {
          promptText = "Describe the content of the image(s)."; // Fallback for image-only multimodal
        }
    } else {
      throw new Error('Invalid input type for Ollama in callGenerativeModel.');
    }
    log(`[Ollama callGenerativeModel] Using prompt: "${promptText.substring(0,100)}..." with ${base64Images ? base64Images.length : 0} image(s).`);
    const resp = await ollamaClient.generate({
      model: OLLAMA_MODEL, 
      prompt: promptText,
      images: base64Images, // This will be undefined if no images, which is fine
      stream: false,
    });
    return resp.response.trim();
  }
  
  // OpenAI branch (using LangChain ChatOpenAI wrapper for general chat)
  if (!Array.isArray(input) || input.length === 0) { 
    throw new Error('OpenAI expects a non-empty messages array for ChatOpenAI.');
  }
  if (!openAIChatModel) throw new Error('OpenAI ChatModel (LangChain) not initialized.');
  const resp = await openAIChatModel.invoke(input);
  const content = typeof resp.content === 'string' ? resp.content : JSON.stringify(resp.content);
  return content.trim();
}

export async function extractTextFromPdfViaMultimodal(filePath: string): Promise<string | null> {
  log(`[AI PDF Extract] Starting extraction for: ${filePath} using ${AI_PROVIDER}`);
  
  if (AI_PROVIDER === 'openai') {
    if (!OPENAI_API_KEY) throw new Error('OpenAI API key is required for PDF extraction.');
    if (!openAIChatCompletionClient) throw new Error('OpenAI raw client not initialized for PDF extraction.');

    try {
      log(`[AI PDF Extract OpenAI] Reading file: ${filePath}`);
      const fileBuffer = fs.readFileSync(filePath);
      const base64Pdf = fileBuffer.toString('base64');
      const fileName = path.basename(filePath);
      log(`[AI PDF Extract OpenAI] PDF read and encoded. Filename: ${fileName}`);

      const promptText = "Extract all text content from this PDF document. Preserve the structure, paragraphs, and line breaks as accurately as possible. Output only the extracted text.";
      
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
          role: "user",
          content: [
            { type: "text", text: promptText },
            {
              type: "file",
              // @ts-ignore 
              file: {
                file_data: `data:application/pdf;base64,${base64Pdf}`,
                filename: fileName
              }
            }
          ]
        }
      ];

      log(`[AI PDF Extract OpenAI] Sending request to model: ${OPENAI_MODEL_NAME}`);
      const response = await openAIChatCompletionClient.chat.completions.create({
        model: OPENAI_MODEL_NAME, 
        messages: messages,
        max_tokens: 4000, 
      });

      const extractedText = response.choices[0]?.message?.content;
      if (extractedText) {
        log(`[AI PDF Extract OpenAI] Successfully extracted text. Length: ${extractedText.length}`);
        return extractedText.trim();
      } else {
        log('[AI PDF Extract OpenAI] No text content found in response choice.');
        return null;
      }
    } catch (error: any) {
      log(`[AI PDF Extract OpenAI] Error: ${error.message}`);
      console.error('[AI PDF Extract OpenAI] Detailed Error:', error);
      return null;
    }
  } else {
    // If not OpenAI, PDF extraction is not supported by this function anymore.
    log(`[AI PDF Extract] PDF extraction is only supported with AI_PROVIDER='openai'. Current provider: '${AI_PROVIDER}'. Skipping PDF processing.`);
    return null;
  }
}

export async function extractCompanyNamesFromText(resumeText: string): Promise<string[]> {
  log('[AI Company Extract] Attempting to extract company names from text.');
  if (AI_PROVIDER !== 'openai') {
    log('[AI Company Extract] Company extraction is currently only supported with AI_PROVIDER=\'openai\'. Skipping.');
    return [];
  }
  if (!resumeText || resumeText.trim().length === 0) {
    log('[AI Company Extract] No resume text provided. Skipping.');
    return [];
  }

  const systemPrompt = "You are an expert resume parser. Your task is to extract company names from the user's work experience sections.";
  const userPrompt = `From the following resume text, please extract a list of all distinct company names where the person has previously worked.
Focus on extracting only the company names.
Return the company names as a flat JSON array of strings. For example: ["Acme Corp", "Beta Industries", "Gamma Solutions LLC"]
If no company names are found, return an empty JSON array: [].

Resume text:
---
${resumeText}
---

JSON array of company names:`;

  try {
    log('[AI Company Extract] Calling generative model for company name extraction.');
    const modelInput = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];
    const rawResponse = await callGenerativeModel(modelInput);
    log(`[AI Company Extract] Raw response from model: ${rawResponse}`);

    // Attempt to parse the JSON array from the model's response
    // The model might sometimes add extra text around the JSON.
    const jsonMatch = rawResponse.match(/(\[.*\])/s);
    if (jsonMatch && jsonMatch[0]) {
      const companyNames = JSON.parse(jsonMatch[0]);
      if (Array.isArray(companyNames) && companyNames.every(item => typeof item === 'string')) {
        log(`[AI Company Extract] Successfully extracted company names: ${companyNames.join(', ')}`);
        return companyNames;
      }
    }
    log('[AI Company Extract] Could not parse a valid JSON array of strings from the model response.');
    return [];
  } catch (error: any) {
    log(`[AI Company Extract] Error during company name extraction: ${error.message}`);
    console.error('[AI Company Extract] Detailed Error:', error);
    return [];
  }
}

export async function generateAnswers(
  user: UserProfile,
  job: JobListing,
  questions: string[]
): Promise<Answer[]> {
  const answers: Answer[] = [];
  for (const question of questions) {
    log(`[generateAnswers] Getting embedding for question: "${question.substring(0,50)}..."`);
    const vec = await getEmbedding(question);
    log(`[generateAnswers] Querying resume and FAQ chunks.`);
    const [resChunks, faqChunks] = await Promise.all(
      [queryResumeChunks(user.id, vec), queryFaqChunks(vec)]
    );
    const resumeText = resChunks.map(r => r.content).join('\n');
    const faqText = faqChunks.map(f => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n');

    const systemPrompt = `Strict: start with ANSWER:. Max 400 chars. Cite [Resume] or [FAQ].`;
    const userPrompt = `Context:\n[Resume]\n${resumeText}\n\n[FAQ]\n${faqText}\n\nJob: ${job.title} at ${job.company}\nDescription: ${job.description}\n\nQuestion: ${question}`;
    
    let modelInput: string | { role: string; content: any }[];

    if (AI_PROVIDER === 'openai') {
      modelInput = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];
    } else { // Ollama
      modelInput = `Context:\n[Resume]\n${resumeText}\n[FAQ]\n${faqText}\nInstruction: ANSWER, first-person, max 400 chars, cite sources.\nQuestion: ${question}\nANSWER:`;
    }
    log(`[generateAnswers] Calling generative model. Input length (if string): ${typeof modelInput === 'string' ? modelInput.length : 'N/A'}`);
    let raw = await callGenerativeModel(modelInput);
    const match = raw.match(/ANSWER:\s*([\s\S]*)/i);
    let answerText = match ? match[1].trim() : raw.trim();
    if (answerText.length > 400) answerText = answerText.slice(0,397) + '...';

    const refs: string[] = [];
    if (answerText.includes('[Resume]')) refs.push('Resume');
    if (answerText.includes('[FAQ]')) refs.push('FAQ');
    if (!refs.length) refs.push(resumeText ? 'Resume' : 'FAQ');

    answers.push({ question, answer: answerText, refs });
    log(`[generateAnswers] Answer generated for question "${question.substring(0,50)}...". Length: ${answerText.length}`);
  }
  return answers;
}

export async function generateCoverLetter(
  user: UserProfile,
  job: JobListing,
  options?: { savePdf?: boolean, outputPath?: string }
): Promise<{ text: string; pdfPath?: string }> {
  log(`[generateCoverLetter] Getting placeholder embeddings.`);
  const vec = Array(100).fill(0); // Placeholder for actual embedding vector if needed for context retrieval
  log(`[generateCoverLetter] Querying resume and FAQ chunks.`);
  const [resChunks, faqChunks] = await Promise.all(
    [queryResumeChunks(user.id, vec), queryFaqChunks(vec)]
  );
  const resumeText = resChunks.map(r => r.content).join('\n - ');
  const faqText = faqChunks.map(f => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n');

  const systemPrompt = `Wrap between COVER_LETTER_BEGINS_HERE and COVER_LETTER_ENDS_HERE. Max 2000 chars.`;
  const userPrompt = `Profile: ${user.name}, ${user.email}\nHighlights:\n - ${resumeText}\nCompany FAQ:\n${faqText}\nJob: ${job.title} at ${job.company}\nDescription: ${job.description}`;

  let modelInput: string | { role: string; content: any }[];

  if (AI_PROVIDER === 'openai') {
    modelInput = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];
  } else { // Ollama
    modelInput = `You are writing a cover letter as an external applicant for the following job.
Applicant Profile: ${user.name}, ${user.email}
Resume Highlights:
 - ${resumeText}
Company FAQ:
${faqText}
Job Posting:
Title: ${job.title}
Company: ${job.company}
Description: ${job.description}
Instruction: Write a 3-paragraph cover letter for this job application. Wrap between COVER_LETTER_BEGINS_HERE and COVER_LETTER_ENDS_HERE. Max 2000 chars. Do NOT assume the applicant already works at the company.`;
  }

  log(`[generateCoverLetter] Calling generative model.`);
  let raw = await callGenerativeModel(modelInput);
  let letter = raw;
  const startIdx = letter.indexOf('COVER_LETTER_BEGINS_HERE');
  const endIdx = letter.indexOf('COVER_LETTER_ENDS_HERE');
  if (startIdx >= 0 && endIdx > startIdx) {
    letter = letter.slice(startIdx + 'COVER_LETTER_BEGINS_HERE'.length, endIdx).trim();
  }
  if (letter.length > 2000) letter = letter.slice(0,1997) + '...';
  log(`[generateCoverLetter] Cover letter generated. Length: ${letter.length}`);

  // If PDF saving is requested
  let pdfPath: string | undefined = undefined;
  if (options?.savePdf) {
    try {
      // Import PDF generation library dynamically to avoid dependency when not needed
      const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
      
      // Create a new PDF document
      const pdfDoc = await PDFDocument.create();
      
      // Add a page to the document
      const page = pdfDoc.addPage([612, 792]); // US Letter size
      
      // Embed the standard font
      const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
      const boldFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
      
      // Set text properties
      const fontSize = 12;
      const lineHeight = fontSize * 1.2;
      const margin = 72; // 1 inch margin
      
      // Format date
      const currentDate = new Date();
      const formattedDate = currentDate.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric', 
        year: 'numeric'
      });
      
      // Draw letterhead
      page.drawText(user.name, {
        x: margin,
        y: 792 - margin - fontSize,
        size: fontSize + 2,
        font: boldFont
      });
      
      page.drawText(user.email, {
        x: margin,
        y: 792 - margin - fontSize * 2 - 5,
        size: fontSize,
        font: font
      });
      
      page.drawText(formattedDate, {
        x: margin,
        y: 792 - margin - fontSize * 4 - 10,
        size: fontSize,
        font: font
      });
      
      // Draw company info (if available)
      page.drawText(`${job.company}`, {
        x: margin,
        y: 792 - margin - fontSize * 6 - 15,
        size: fontSize,
        font: boldFont
      });
      
      page.drawText(`Re: ${job.title}`, {
        x: margin,
        y: 792 - margin - fontSize * 7 - 20,
        size: fontSize,
        font: font
      });
      
      // Draw salutation
      page.drawText("Dear Hiring Manager,", {
        x: margin,
        y: 792 - margin - fontSize * 9 - 30,
        size: fontSize,
        font: font
      });
      
      // Draw the cover letter text - handle line wrapping
      const maxWidth = 612 - (margin * 2);
      const words = letter.split(/\s+/);
      let line = "";
      let y = 792 - margin - fontSize * 11 - 35;
      
      // Process paragraph by paragraph
      const paragraphs = letter.split(/\n\n+/);
      
      for (const paragraph of paragraphs) {
        const words = paragraph.split(/\s+/);
        line = "";
        
        for (const word of words) {
          const testLine = line ? line + " " + word : word;
          const testWidth = font.widthOfTextAtSize(testLine, fontSize);
          
          if (testWidth > maxWidth) {
            page.drawText(line, {
              x: margin,
              y,
              size: fontSize,
              font: font
            });
            line = word;
            y -= lineHeight;
            
            // Add a new page if we run out of space
            if (y < margin) {
              const newPage = pdfDoc.addPage([612, 792]);
              y = 792 - margin - fontSize;
            }
          } else {
            line = testLine;
          }
        }
        
        // Draw the last line of the paragraph
        if (line) {
          page.drawText(line, {
            x: margin,
            y,
            size: fontSize,
            font: font
          });
          y -= lineHeight * 2; // Double space between paragraphs
        }
      }
      
      // Draw closing
      y -= lineHeight * 0.5;
      page.drawText("Sincerely,", {
        x: margin,
        y,
        size: fontSize,
        font: font
      });
      
      y -= lineHeight * 3;
      page.drawText(user.name, {
        x: margin,
        y,
        size: fontSize,
        font: font
      });
      
      // Determine the output path
      pdfPath = options.outputPath || path.join(
        process.cwd(), 
        'output', 
        `cover-letter-${job.company.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${Date.now()}.pdf`
      );
      
      // Ensure the directory exists
      const outputDir = path.dirname(pdfPath);
      fs.mkdirSync(outputDir, { recursive: true });
      
      // Save the PDF
      const pdfBytes = await pdfDoc.save();
      fs.writeFileSync(pdfPath, pdfBytes);
      
      log(`[generateCoverLetter] Cover letter saved as PDF: ${pdfPath}`);
    } catch (error: any) {
      log(`[generateCoverLetter] Error saving PDF: ${error.message}`);
      console.error('[generateCoverLetter] PDF generation error:', error);
    }
  }

  return { text: letter, pdfPath };
}
