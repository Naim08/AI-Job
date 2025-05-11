import { UserProfile, JobListing, Answer, ResumeChunk, FAQ } from '../src/shared/types.js';
import { exec } from 'child_process'; // For Ollama version check
import util from 'util';
import { Ollama } from 'ollama';
import dotenv from 'dotenv';

import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';

dotenv.config();
const execAsync = util.promisify(exec);
const debug = (namespace: string) => (...args: any[]) => {};
const log = debug('jobot:ai');

// --- AI Provider Configuration ---
const AI_PROVIDER = process.env.AI_PROVIDER || 'ollama';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2:latest';
const OLLAMA_EMBEDDING_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text';
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL_NAME = process.env.OPENAI_MODEL_NAME || 'gpt-3.5-turbo';
const OPENAI_EMBEDDING_MODEL_NAME = process.env.OPENAI_EMBEDDING_MODEL_NAME || 'text-embedding-3-small';

log(`AI Provider: ${AI_PROVIDER}`);

let ollamaClient: Ollama | null = null;
let openAIChatModel: ChatOpenAI | null = null;
let openAIEmbeddings: OpenAIEmbeddings | null = null;

if (AI_PROVIDER === 'ollama') {
  ollamaClient = new Ollama({ host: OLLAMA_HOST });
  log('Initialized Ollama client.');
} else if (AI_PROVIDER === 'openai') {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key is required when AI_PROVIDER is openai.');
  }
  openAIChatModel = new ChatOpenAI({ apiKey: OPENAI_API_KEY, modelName: OPENAI_MODEL_NAME });
  openAIEmbeddings = new OpenAIEmbeddings({ apiKey: OPENAI_API_KEY, modelName: OPENAI_EMBEDDING_MODEL_NAME });
  log('Initialized OpenAI clients.');
} else {
  throw new Error(`Invalid AI_PROVIDER: ${AI_PROVIDER}`);
}

async function ensureOllamaInstalled(): Promise<void> {
  try {
    await ollamaClient?.list();
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

async function getEmbedding(text: string): Promise<number[]> {
  if (AI_PROVIDER === 'ollama') {
    await ensureOllamaInstalled();
    const resp = await ollamaClient!.embeddings({ model: OLLAMA_EMBEDDING_MODEL, prompt: text });
    return resp.embedding;
  }
  const embedding = await openAIEmbeddings!.embedQuery(text);
  return embedding;
}

async function queryResumeChunks(userId: string, questionVector: number[]): Promise<Pick<ResumeChunk,'content'>[]> {
  await new Promise(r => setTimeout(r, 50));
  return [
    { content: "Experienced software engineer with a passion for AI. Proficient in TypeScript and Python." },
    { content: "Developed full-stack applications using TypeScript and Node.js with LLM integration." },
    { content: "Skilled in Python, data analysis, and ML deployment with Ollama." },
  ];
}

async function queryFaqChunks(_: number[]): Promise<Pick<FAQ,'question'|'answer'>[]> {
  await new Promise(r => setTimeout(r, 50));
  return [
    { question: "What are your strengths?", answer: "Problem-solving, rapid learning, and adaptability." },
    { question: "Why this role?", answer: "Aligns with my AI development goals and LLM experience." },
    { question: "Challenging project?", answer: "Optimized a RAG pipeline to reduce hallucinations by 30%." },
  ];
}

/**
 * Calls Ollama or OpenAI based on AI_PROVIDER.
 */
async function callGenerativeModel(
  input: string | { role: string; content: string }[]
): Promise<string> {
  if (AI_PROVIDER === 'ollama') {
    if (typeof input !== 'string') throw new Error('Ollama expects a prompt string.');
    await ensureOllamaInstalled();
    const resp = await ollamaClient!.generate({ model: OLLAMA_MODEL, prompt: input, stream: false });
    return resp.response.trim();
  }
  // OpenAI branch
  if (!Array.isArray(input)) throw new Error('OpenAI expects messages array.');
  const resp = await openAIChatModel!.invoke(input);
  const content = typeof resp.content === 'string' ? resp.content : JSON.stringify(resp.content);
  return content.trim();
}

export async function generateAnswers(
  user: UserProfile,
  job: JobListing,
  questions: string[]
): Promise<Answer[]> {
  const answers: Answer[] = [];
  for (const question of questions) {
    const vec = await getEmbedding(question);
    const [resChunks, faqChunks] = await Promise.all(
      [queryResumeChunks(user.id, vec), queryFaqChunks(vec)]
    );
    const resumeText = resChunks.map(r => r.content).join('\n');
    const faqText = faqChunks.map(f => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n');

    const systemMsg = {
      role: 'system', content:
        `Strict: start with ANSWER:. Max 400 chars. Cite [Resume] or [FAQ].`
    };
    const userMsg = {
      role: 'user', content:
        `Context:\n[Resume]\n${resumeText}\n\n[FAQ]\n${faqText}\n\nJob: ${job.title} at ${job.company}\nDescription: ${job.description}\n\nQuestion: ${question}`
    };

    const input = AI_PROVIDER === 'openai' ? [systemMsg, userMsg] :
      `Context:\n[Resume]\n${resumeText}\n[FAQ]\n${faqText}\nInstruction: ANSWER, first-person, max 400 chars, cite sources.\nQuestion: ${question}\nANSWER:`;

    let raw = await callGenerativeModel(input);
    const match = raw.match(/ANSWER:\s*([\s\S]*)/i);
    let answer = match ? match[1].trim() : raw.trim();
    if (answer.length > 400) answer = answer.slice(0,397) + '...';

    const refs: string[] = [];
    if (answer.includes('[Resume]')) refs.push('Resume');
    if (answer.includes('[FAQ]')) refs.push('FAQ');
    if (!refs.length) refs.push(resumeText ? 'Resume' : 'FAQ');

    answers.push({ question, answer, refs });
  }
  return answers;
}

export async function generateCoverLetter(
  user: UserProfile,
  job: JobListing
): Promise<string> {
  const vec = Array(100).fill(0);
  const [resChunks, faqChunks] = await Promise.all(
    [queryResumeChunks(user.id, vec), queryFaqChunks(vec)]
  );
  const resumeText = resChunks.map(r => r.content).join('\n - ');
  const faqText = faqChunks.map(f => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n');

  const systemMsg = {
    role: 'system', content:
      `Wrap between COVER_LETTER_BEGINS_HERE and COVER_LETTER_ENDS_HERE. Max 2000 chars.`
  };
  const userMsg = {
    role: 'user', content:
      `Profile: ${user.name}, ${user.email}\nHighlights:\n - ${resumeText}\nCompany FAQ:\n${faqText}\nJob: ${job.title} at ${job.company}\nDescription: ${job.description}`
  };

  const input = AI_PROVIDER === 'openai'
    ? [systemMsg, userMsg]
    : `You are writing a cover letter as an external applicant for the following job.
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

  let raw = await callGenerativeModel(input);
  let letter = raw;
  const start = letter.indexOf('COVER_LETTER_BEGINS_HERE');
  const end = letter.indexOf('COVER_LETTER_ENDS_HERE');
  if (start >= 0 && end > start) {
    letter = letter.slice(start+24, end).trim();
  }
  if (letter.length > 2000) letter = letter.slice(0,1997) + '...';
  return letter;
}
