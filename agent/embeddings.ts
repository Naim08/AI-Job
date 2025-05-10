import { SupabaseClient } from '@supabase/supabase-js';
// import { UserProfile } from '...'; // TODO: Determine path to UserProfile. For now, using a local one.
import debug from 'debug';
import execa from 'execa';
import crypto from 'crypto';
import { supabase } from '../src/lib/supabaseClient';
// Make sure to run `npm install debug execa` and `npm install --save-dev @types/debug`

const log = debug('jobot:embeddings');

// Local UserProfile, replace with actual import if available
interface UserProfile {
    id: string;
    // resume_text will be fetched from 'profiles' table
}

// Assumed DB structure - verify these with your actual schema
interface DbProfile {
    id: string;
    resume_text: string | null; // Assuming this is the column name
}

interface DbFaqItem {
    id: string; // Primary key of the faq item
    question: string;
    answer: string;
    user_id: string; // Foreign key linking to profiles.id
}

// Structure for upserting into resume_chunks
interface ResumeChunkInsert {
    id: string;          // Hash of text content
    user_id: string;
    text: string;        // Storing the actual chunk text
    embedding: number[]; // Storing the vector
}

// Structure for upserting into faq_chunks
interface FaqChunkInsert {
    id: string;          // Hash of text content
    user_id: string;
    faq_id: string;      // Foreign key to the original FAQ item
    text: string;        // Storing the actual chunk text
    embedding: number[]; // Storing the vector
}

const CHUNK_SIZE = 1000;       // Max characters per chunk
const CHUNK_OVERLAP = 200;     // Characters to overlap between chunks
const OLLAMA_MODEL = "nomic-embed-text"; // Ollama model for embeddings
const EXPECTED_EMBEDDING_LENGTH = 768; // For nomic-embed-text

/**
 * Splits text into sentences. A simple approach.
 */
function splitIntoSentences(text: string): string[] {
    if (!text) return [];
    const sentences = text.match(/[^.!?\n]+[.!?\n]?/g) || [];
    return sentences.map(s => s.trim()).filter(s => s.length > 0);
}

/**
 * Chunks text based on sentences, aiming for chunkSize with overlap.
 */
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

        // If adding this sentence would exceed chunk size, finalize the current chunk
        if (currentChunkSentences.length > 0 && currentChunkLength + (currentChunkSentences.length > 0 ? 1 : 0) + sentenceLength > chunkSize) {
            chunks.push(currentChunkSentences.join(' '));

            // Create overlap for the next chunk
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
            // Do not increment sentenceIndex, so the current sentence is processed for the new chunk
        } else {
            // Add sentence to current chunk
            currentChunkSentences.push(sentence);
            currentChunkLength += sentenceLength + (currentChunkSentences.length > 1 ? 1 : 0);
            sentenceIndex++;
        }
    }

    // Add the last chunk if it has content
    if (currentChunkSentences.length > 0) {
        chunks.push(currentChunkSentences.join(' '));
    }

    return chunks.filter(c => c.trim().length > 0);
}


async function getEmbedding(chunk: string): Promise<number[]> {
    log(`Generating embedding for chunk (length: ${chunk.length}), starting with: "${chunk.substring(0, 80)}..."`);
    try {
        // User CLI pattern: ollama embeddings -m nomic-embed-text -t ${chunk}
        // For execa, providing text via `input` is safer.
        // The model 'nomic-embed-text' should output a JSON with an "embedding" array.
        const { stdout } = await execa('ollama', ['embeddings', '-m', OLLAMA_MODEL], { input: chunk });

        // stdout should be a JSON string like {"embedding": [0.1, 0.2, ...]}
        const output = JSON.parse(stdout as string); // Force stdout to string

        if (output && Array.isArray(output.embedding)) {
            if (output.embedding.length !== EXPECTED_EMBEDDING_LENGTH) {
                log.warn(`Warning: Embedding dimension mismatch for model ${OLLAMA_MODEL}. Expected ${EXPECTED_EMBEDDING_LENGTH}, Got ${output.embedding.length}. Chunk: "${chunk.substring(0,50)}..."`);
            }
            log(`Successfully generated embedding, dimensions: ${output.embedding.length}`);
            return output.embedding;
        }
        log('Error: Invalid embedding format from Ollama. stdout:', stdout);
        throw new Error('Invalid embedding format from Ollama');
    } catch (error: any) {
        log('Error generating embedding from Ollama:', error.message);
        if (error.stderr) {
            log('Ollama stderr:', error.stderr);
        }
        if (error.stdout) {
            log('Ollama stdout (on error):', error.stdout);
        }
        throw error; // Re-throw to be caught by the calling function
    }
}

function generateDeterministicId(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex');
}

export async function syncEmbeddings(user: UserProfile): Promise<void> {
    log(`Starting embedding sync for user: ${user.id}`);
    let totalChunksProcessed = 0;
    let totalChunksUpserted = 0;

    // 1. Fetch profile.resume_text
    log(`Fetching resume_text for user ${user.id} from profiles table...`);
    const { data: profileData, error: profileError } = await supabase
        .from('profiles') // ASSUMPTION: Table is 'profiles'
        .select('id, resume_text') // ASSUMPTION: Column is 'resume_text'
        .eq('id', user.id)
        .single<DbProfile>(); // Specify expected type for better type safety

    if (profileError) {
        log(`Error fetching profile for user ${user.id}: ${profileError.message}`);
        return;
    }
    if (!profileData) {
        log(`No profile data found for user ${user.id}.`);
        // return; // Decide if to proceed if no profile, FAQs might still exist
    }

    const resumeText = profileData?.resume_text;

    // 2. Process Resume
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
                    id,
                    user_id: user.id,
                    text: chunk, // Column name for Supabase: 'text'
                    embedding,   // Column name for Supabase: 'embedding' (type vector)
                });
            } catch (e: any) {
                log(`Failed to generate embedding for a resume chunk. User: ${user.id}. Error: ${e.message}. Chunk start: "${chunk.substring(0, 50)}..."`);
            }
        }

        if (resumeChunksToUpsert.length > 0) {
            log(`Upserting ${resumeChunksToUpsert.length} resume chunks for user ${user.id}...`);
            // IMPORTANT: The linter errors previously indicated that Supabase types expect 'embedding' as string.
            // This is likely due to outdated or misconfigured generated types for your Supabase client.
            // The actual pgvector column expects number[]. The `as any` here is a temporary workaround
            // and should be removed once Supabase client types are correct.
            const { error: upsertError } = await supabase
                .from('resume_chunks') // ASSUMPTION: Table is 'resume_chunks'
                .upsert(resumeChunksToUpsert as any, { onConflict: 'id' });

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

    // 3. Fetch and Process FAQs
    log(`Fetching FAQs for user ${user.id} from faq table...`);
    const { data: faqsData, error: faqsError } = await supabase
        .from('faq') // ASSUMPTION: Table is 'faq'
        .select('id, question, answer, user_id') // ASSUMPTION: Columns are 'id', 'question', 'answer', 'user_id'
        .eq('user_id', user.id) // ASSUMPTION: FK is 'user_id'
        .returns<DbFaqItem[]>(); // Specify expected return type

    if (faqsError) {
        log(`Error fetching FAQs for user ${user.id}: ${faqsError.message}`);
        // return; // Decide if to stop or continue
    }

    if (faqsData && faqsData.length > 0) {
        log(`Processing ${faqsData.length} FAQs for user ${user.id}.`);
        const faqChunksToUpsert: FaqChunkInsert[] = [];

        for (const faqItem of faqsData) {
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
                        id,
                        user_id: user.id,
                        faq_id: faqItem.id,
                        text: chunk, // Column name for Supabase: 'text'
                        embedding,   // Column name for Supabase: 'embedding' (type vector)
                    });
                } catch (e: any) {
                    log(`Failed to generate embedding for an FAQ chunk. User: ${user.id}, FAQ ID: ${faqItem.id}. Error: ${e.message}. Chunk start: "${chunk.substring(0, 50)}..."`);
                }
            }
        }

        if (faqChunksToUpsert.length > 0) {
            log(`Upserting ${faqChunksToUpsert.length} FAQ chunks for user ${user.id}...`);
            // See comment above for resume_chunks regarding 'as any'
            const { error: upsertError } = await supabase
                .from('faq_chunks') // ASSUMPTION: Table is 'faq_chunks'
                .upsert(faqChunksToUpsert as any, { onConflict: 'id' });

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
    // Output for manual dev test as requested
    console.log(`Synced ${totalChunksUpserted} chunks for user ${user.id}.`);
}


// --- CLI Runner for manual testing ---
async function runCli() {
    log('CLI mode: Parsing arguments...');
    const args = process.argv.slice(2);
    const userIdArg = args.find(arg => arg.startsWith('--user='));

    if (!userIdArg) {
        console.error('Error: Missing user ID.');
        console.error('Usage: npx ts-node agent/embeddings.ts --user=<USER_ID>');
        process.exit(1);
    }

    const userId = userIdArg.split('=')[1];
    if (!userId || userId.trim() === '') {
        console.error('Error: User ID cannot be empty.');
        console.error('Usage: npx ts-node agent/embeddings.ts --user=<USER_ID>');
        process.exit(1);
    }

    log(`CLI mode: User ID specified: ${userId}`);
    // For CLI testing, we only need the ID.
    const user: UserProfile = { id: userId };

    try {
        log('CLI mode: Starting syncEmbeddings...');
        await syncEmbeddings(user);
        log('CLI mode: syncEmbeddings completed.');
    } catch (error: any) {
        log(`CLI mode: Error during embedding sync for user ${userId}: ${error.message}`);
        console.error(`Critical error during sync for user ${userId}:`, error.message); // Also to console for visibility
        process.exit(1);
    }
}

// Ensure script runs via CLI only when executed directly
if (require.main === module) {
    log('Agent embeddings script running in CLI mode.');
    runCli();
} 