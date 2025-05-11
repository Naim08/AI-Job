import { SupabaseClient } from '@supabase/supabase-js';
import { UserProfile } from "../src/shared/types.js";
import debug from 'debug';
import execa from 'execa';
import crypto from 'crypto';
import { supabase } from '../src/lib/supabaseClient.js';

const log = debug('jobot:embeddings');

interface DbProfile {
    user_id: string;
    id: string;
    resume_text: string | null;
    created_at: string;
    updated_at: string;
}

interface DbFaqItem {
    id: string;
    question: string;
    answer: string;
    user_id: string | null;
    created_at: string;
}

interface ResumeChunkInsert {
    id: string;
    user_id: string;
    resume_text_content: string;
    embedding: number[];
}

interface FaqChunkInsert {
    id: string;
    user_id: string;
    faq_id: string;
    chunk_text: string;
    embedding: number[];
}

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;
const OLLAMA_MODEL = "nomic-embed-text";
const EXPECTED_EMBEDDING_LENGTH = 768;

function splitIntoSentences(text: string): string[] {
    if (!text) return [];
    const sentences = text.match(/[^.!?\n]+[.!?\n]?/g) || [];
    return sentences.map(s => s.trim()).filter(s => s.length > 0);
}

function chunkText(text: string, chunkSize: number, overlapSize: number): string[] {
    const sentences = splitIntoSentences(text);
    const chunks: string[] = [];
    if (sentences.length === 0) return chunks;

    let currentChunkSentences: string[] = [];
    let currentChunkLength = 0;
    let sentenceIndex = 0;

    while (sentenceIndex < sentences.length) {
        const sentence = sentences[sentenceIndex];
        const sentenceLength = sentence.length;

        if (currentChunkSentences.length > 0 && currentChunkLength + (currentChunkSentences.length > 0 ? 1 : 0) + sentenceLength > chunkSize) {
            chunks.push(currentChunkSentences.join(' '));
            let charsForOverlap = 0;
            let overlapSentences: string[] = [];
            for (let i = currentChunkSentences.length - 1; i >= 0; i--) {
                const prevSentence = currentChunkSentences[i];
                if (charsForOverlap + prevSentence.length + (overlapSentences.length > 0 ? 1 : 0) <= overlapSize) {
                    overlapSentences.unshift(prevSentence);
                    charsForOverlap += prevSentence.length + (overlapSentences.length > 0 ? 1 : 0);
                } else {
                    break;
                }
            }
            currentChunkSentences = overlapSentences;
            currentChunkLength = charsForOverlap;
        } else {
            currentChunkSentences.push(sentence);
            currentChunkLength += sentenceLength + (currentChunkSentences.length > 1 ? 1 : 0);
            sentenceIndex++;
        }
    }
    if (currentChunkSentences.length > 0) {
        chunks.push(currentChunkSentences.join(' '));
    }
    return chunks.filter(c => c.trim().length > 0);
}

async function getEmbedding(chunk: string): Promise<number[]> {
    log(`Generating embedding for chunk (length: ${chunk.length}), starting with: "${chunk.substring(0, 80)}..." via Ollama API`);
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

        const response = await fetch('http://localhost:11434/api/embeddings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: OLLAMA_MODEL,
                prompt: chunk,
            }),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorBody = await response.text();
            log(`Error from Ollama API: ${response.status} ${response.statusText}. Body: ${errorBody}`);
            throw new Error(`Ollama API request failed with status ${response.status}: ${errorBody}`);
        }

        const output = await response.json();

        if (output && Array.isArray(output.embedding)) {
            if (output.embedding.length !== EXPECTED_EMBEDDING_LENGTH) {
                log(`WARNING: Embedding dimension mismatch for model ${OLLAMA_MODEL}. Expected ${EXPECTED_EMBEDDING_LENGTH}, Got ${output.embedding.length}. Chunk: "${chunk.substring(0,50)}..."`);
            }
            log(`Successfully generated embedding via API, dimensions: ${output.embedding.length}`);
            return output.embedding;
        }
        log('Error: Invalid embedding format from Ollama API. Response:', JSON.stringify(output));
        throw new Error('Invalid embedding format from Ollama API');
    } catch (error: any) {
        if (error.name === 'AbortError') {
            log('Error generating embedding from Ollama API: Request timed out.');
            throw new Error('Ollama API request timed out');
        }
        log('Error generating embedding from Ollama API:', error.message);
        throw error;
    }
}

function generateDeterministicId(text: string): string {
    const hash = crypto.createHash('sha256').update(text).digest('hex');
    // Take the first 32 characters (128 bits) of the SHA256 hash and format as a UUID
    // xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    return `${hash.substring(0, 8)}-${hash.substring(8, 12)}-${hash.substring(12, 16)}-${hash.substring(16, 20)}-${hash.substring(20, 32)}`;
}

export async function syncEmbeddings(user: UserProfile): Promise<void> {
    log(`Starting embedding sync for user: ${user.id}`);
    let totalChunksProcessed = 0;
    let totalChunksUpserted = 0;

    log(`Fetching resume_text for user ${user.id} from profiles table using user_id column...`);
    const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, user_id, resume_text, created_at, updated_at')
        .eq('user_id', user.id)
        .single<DbProfile>();

    if (profileError) {
        log(`Error fetching profile for user ${user.id}: ${profileError.message}`);
        return;
    }
    if (!profileData) {
        log(`No profile data found for user ${user.id}.`);
    }
    const resumeText = profileData?.resume_text;
    if (resumeText && resumeText.trim().length > 0) {
        log(`Processing resume for user ${user.id}. Text length: ${resumeText.length}`);
        const textChunks = chunkText(resumeText, CHUNK_SIZE, CHUNK_OVERLAP);
        log(`Resume split into ${textChunks.length} chunks.`);
        totalChunksProcessed += textChunks.length;
        const resumeChunksToUpsert: ResumeChunkInsert[] = [];
        for (const chunk of textChunks) {
            if (chunk.trim().length === 0) continue;
            try {
                const embedding = await getEmbedding(chunk);
                const id = generateDeterministicId(chunk);
                resumeChunksToUpsert.push({
                    id, user_id: user.id, resume_text_content: chunk, embedding,
                });
            } catch (e: any) {
                log(`Failed to generate embedding for a resume chunk. User: ${user.id}. Error: ${e.message}. Chunk start: "${chunk.substring(0, 50)}..."`);
            }
        }
        if (resumeChunksToUpsert.length > 0) {
            log(`Upserting ${resumeChunksToUpsert.length} resume chunks for user ${user.id}...`);
            const { error: upsertError } = await supabase
                .from('resume_chunks').upsert(resumeChunksToUpsert as any, { onConflict: 'id' });
            if (upsertError) {
                log(`Error upserting resume chunks for user ${user.id}: ${upsertError.message}`);
            } else {
                totalChunksUpserted += resumeChunksToUpsert.length;
                log(`Successfully upserted ${resumeChunksToUpsert.length} resume chunks for user ${user.id}.`);
            }
        }
    } else {
        log(`No resume text to process for user ${user.id}.`);
    }

    log(`Fetching FAQs for user ${user.id} from faq table...`);
    const { data: faqsData, error: faqsError } = await supabase
        .from('faq')
        .select('id, question, answer, user_id, created_at')
        .eq('user_id', user.id);

    if (faqsError) {
        log(`Error fetching FAQs for user ${user.id}: ${faqsError.message}`);
    }

    if (faqsData && faqsData.length > 0) {
        log(`Processing ${faqsData.length} FAQs for user ${user.id}.`);
        const faqChunksToUpsert: FaqChunkInsert[] = [];
        for (const faqItem of faqsData as DbFaqItem[]) { // Explicit cast here as .returns<T> was removed
            if (!faqItem.question || !faqItem.answer) {
                log(`Skipping FAQ item ${faqItem.id} due to missing question or answer.`);
                continue;
            }
            const faqFullText = `${faqItem.question}\n${faqItem.answer}`;
            log(`Processing FAQ item ${faqItem.id}. Text length: ${faqFullText.length}`);
            const textChunks = chunkText(faqFullText, CHUNK_SIZE, CHUNK_OVERLAP);
            log(`FAQ item ${faqItem.id} split into ${textChunks.length} chunks.`);
            totalChunksProcessed += textChunks.length;
            for (const chunk of textChunks) {
                if (chunk.trim().length === 0) continue;
                try {
                    const embedding = await getEmbedding(chunk);
                    const id = generateDeterministicId(chunk);
                    faqChunksToUpsert.push({
                        id, user_id: user.id, faq_id: faqItem.id, chunk_text: chunk, embedding,
                    });
                } catch (e: any) {
                    log(`Failed to generate embedding for an FAQ chunk. User: ${user.id}, FAQ ID: ${faqItem.id}. Error: ${e.message}. Chunk start: "${chunk.substring(0, 50)}..."`);
                }
            }
        }
        if (faqChunksToUpsert.length > 0) {
            log(`Upserting ${faqChunksToUpsert.length} FAQ chunks for user ${user.id}...`);
            const { error: upsertError } = await supabase
                .from('faq_chunks').upsert(faqChunksToUpsert as any, { onConflict: 'id' });
            if (upsertError) {
                log(`Error upserting FAQ chunks for user ${user.id}: ${upsertError.message}`);
            } else {
                totalChunksUpserted += faqChunksToUpsert.length;
                log(`Successfully upserted ${faqChunksToUpsert.length} FAQ chunks for user ${user.id}.`);
            }
        }
    } else {
        log(`No FAQs to process for user ${user.id}.`);
    }
    log(`Embedding sync finished for user ${user.id}. Total chunks processed: ${totalChunksProcessed}, Total chunks upserted: ${totalChunksUpserted}.`);
    console.log(`Synced ${totalChunksUpserted} chunks for user ${user.id}.`);
}

async function runCli() {
    log('CLI mode: Parsing arguments...');
    const args = process.argv.slice(2);
    let userId: string | undefined = undefined;

    const userArgIndex = args.findIndex(arg => arg === '--user' || arg.startsWith('--user='));

    if (userArgIndex !== -1) {
        const userArgValue = args[userArgIndex];
        if (userArgValue.startsWith('--user=')) {
            userId = userArgValue.split('=')[1];
        } else if (userArgValue === '--user' && args.length > userArgIndex + 1) {
            // Ensure the next argument is not another option flag
            if (!args[userArgIndex + 1].startsWith('--')) {
                 userId = args[userArgIndex + 1];
            }
        }
    }

    if (!userId || userId.trim() === '') {
        console.error('Error: Missing or invalid user ID.');
        console.error('Usage examples:');
        console.error('  npx ts-node agent/embeddings.ts --user=<USER_ID>');
        console.error('  node --loader ts-node/esm agent/embeddings.ts --user <USER_ID>');
        process.exit(1);
    }

    log(`CLI mode: User ID specified: ${userId}`);
    const user: UserProfile = {
        id: userId,
        name: 'Test User',
        email: 'test@example.com'
    };
    try {
        log('CLI mode: Starting syncEmbeddings...');
        await syncEmbeddings(user);
        log('CLI mode: syncEmbeddings completed.');
    } catch (error: any) {
        log(`CLI mode: Error during embedding sync for user ${userId}: ${error.message}`);
        console.error(`Critical error during sync for user ${userId}:`, error.message);
        if (error.stack) {
            log(`CLI mode: Error stack: ${error.stack}`);
        }
        process.exit(1);
    }
}

// Determine if the script is being run directly
const scriptUrl = import.meta.url;
const mainScriptPath = process.argv[1];

if (scriptUrl.startsWith('file:') && mainScriptPath === new URL(scriptUrl).pathname) {
    log('Agent embeddings script running in CLI mode.');
    runCli();
} 