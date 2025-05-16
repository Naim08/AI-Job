import { UserProfile } from "../src/shared/types.js";
import { TablesInsert } from "../src/shared/supabase.js";
import debug from "debug";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { supabase } from "../src/lib/supabaseClient.js";
import {
  extractTextFromPdfViaMultimodal,
  getEmbedding as getEmbeddingFromAI,
  extractCompanyNamesFromText,
} from "../agent/ai.js";

const log = debug("jobot:embeddings");

interface DbProfile {
  user_id: string;
  id: string;
  resume_path: string | null;
  email: string | null;
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

function splitIntoSentences(text: string): string[] {
  if (!text) return [];
  const sentences = text.match(/[^.!?\n]+[.!?\n]?/g) || [];
  return sentences.map((s) => s.trim()).filter((s) => s.length > 0);
}

function chunkText(
  text: string,
  chunkSize: number,
  overlapSize: number
): string[] {
  const sentences = splitIntoSentences(text);
  const chunks: string[] = [];
  if (sentences.length === 0) return chunks;

  let currentChunkSentences: string[] = [];
  let currentChunkLength = 0;
  let sentenceIndex = 0;

  while (sentenceIndex < sentences.length) {
    const sentence = sentences[sentenceIndex];
    const sentenceLength = sentence.length;

    if (
      currentChunkSentences.length > 0 &&
      currentChunkLength +
        (currentChunkSentences.length > 0 ? 1 : 0) +
        sentenceLength >
        chunkSize
    ) {
      chunks.push(currentChunkSentences.join(" "));
      let charsForOverlap = 0;
      const overlapSentences: string[] = [];
      for (let i = currentChunkSentences.length - 1; i >= 0; i--) {
        const prevSentence = currentChunkSentences[i];
        if (
          charsForOverlap +
            prevSentence.length +
            (overlapSentences.length > 0 ? 1 : 0) <=
          overlapSize
        ) {
          overlapSentences.unshift(prevSentence);
          charsForOverlap +=
            prevSentence.length + (overlapSentences.length > 0 ? 1 : 0);
        } else {
          break;
        }
      }
      currentChunkSentences = overlapSentences;
      currentChunkLength = charsForOverlap;
    } else {
      currentChunkSentences.push(sentence);
      currentChunkLength +=
        sentenceLength + (currentChunkSentences.length > 1 ? 1 : 0);
      sentenceIndex++;
    }
  }
  if (currentChunkSentences.length > 0) {
    chunks.push(currentChunkSentences.join(" "));
  }
  return chunks.filter((c) => c.trim().length > 0);
}

function generateDeterministicId(text: string): string {
  const hash = crypto.createHash("sha256").update(text).digest("hex");
  // Take the first 32 characters (128 bits) of the SHA256 hash and format as a UUID
  // xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  return `${hash.substring(0, 8)}-${hash.substring(8, 12)}-${hash.substring(
    12,
    16
  )}-${hash.substring(16, 20)}-${hash.substring(20, 32)}`;
}

export async function syncEmbeddings(user: UserProfile): Promise<void> {
  log(
    `Starting embedding sync for user: ${user.id} using AI-powered services.`
  );
  let totalChunksProcessed = 0;
  let totalChunksUpserted = 0;

  log(
    `Fetching profile details for user ${user.id} (including resume_path)...`
  );
  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("id, user_id, resume_path, email, created_at, updated_at")
    .eq("user_id", user.id)
    .single<DbProfile>();

  if (profileError) {
    log(`Error fetching profile for user ${user.id}: ${profileError.message}`);
    return;
  }
  if (!profileData) {
    log(`No profile data found for user ${user.id}.`);
    return;
  }

  const resumePath = profileData.resume_path || user.resume_path;
  let resumeTextToProcess: string | null = null;
  log(
    `[EmbeddingsV4] User object received in syncEmbeddings: ${JSON.stringify(
      user
    )}`
  );
  log(`[EmbeddingsV4] profileData from DB: ${JSON.stringify(profileData)}`);
  log(`[EmbeddingsV4] Effective resumePath to be used: ${resumePath}`);

  if (resumePath && resumePath.trim().length > 0) {
    log(`[EmbeddingsV4] Resume path is valid and non-empty: "${resumePath}"`);

    if (!path.isAbsolute(resumePath)) {
      log(
        `[EmbeddingsV4] WARNING: Resume path "${resumePath}" for user ${user.id} is not an absolute path. Skipping resume processing.`
      );
    } else {
      log(
        `[EmbeddingsV4] Resume path "${resumePath}" is absolute. Proceeding to file check.`
      );
      try {
        const fileExists = fs.existsSync(resumePath);
        log(
          `[EmbeddingsV4] fs.existsSync("${resumePath}") returned: ${fileExists}`
        );
        if (fileExists) {
          log(
            `[EmbeddingsV4] Attempting to extract text from PDF via AI: ${resumePath}`
          );
          resumeTextToProcess = await extractTextFromPdfViaMultimodal(
            resumePath
          );

          if (resumeTextToProcess && resumeTextToProcess.length > 0) {
            log(
              `[EmbeddingsV4] Successfully extracted ${resumeTextToProcess.length} characters of text from PDF via AI.`
            );
          } else {
            log(
              `[EmbeddingsV4] AI PDF text extraction failed or returned no text for ${resumePath}.`
            );
            resumeTextToProcess = null; // Ensure it's null if extraction fails or returns empty
          }
        } else {
          log(
            `[EmbeddingsV4] Resume PDF not found at path: ${resumePath} for user ${user.id}.`
          );
        }
      } catch (e: any) {
        log(
          `[EmbeddingsV4] Error during AI PDF text extraction for user ${user.id} from ${resumePath}: ${e.message}`
        );
        if (e.stack) log(`[EmbeddingsV4] Stack trace: ${e.stack}`);
        resumeTextToProcess = null; // Ensure it's null on error
      }
    }
  } else {
    log(
      `[EmbeddingsV4] No resume_path found in profile or provided user object for user ${user.id}.`
    );
  }

  if (resumeTextToProcess && resumeTextToProcess.trim().length > 0) {
    log(
      `[EmbeddingsV4] New resume text successfully processed for user ${user.id}. Preparing to delete old resume chunks.`
    );

    // --- New: Delete existing resume chunks for this user ---
    try {
      const { error: deleteError } = await supabase
        .from("resume_chunks")
        .delete()
        .eq("user_id", user.id);

      if (deleteError) {
        log(
          `[EmbeddingsV4] Error deleting old resume chunks for user ${user.id}: ${deleteError.message}. Proceeding with new chunk generation, but old chunks may persist.`
        );
        // Potentially re-throw or handle more critically if needed
      } else {
        log(
          `[EmbeddingsV4] Successfully deleted old resume chunks for user ${user.id}.`
        );
      }
    } catch (e: any) {
      log(
        `[EmbeddingsV4] Exception during deletion of old resume chunks for user ${user.id}: ${e.message}. Proceeding with new chunk generation.`
      );
    }
    // --- End of deletion block ---

    log(
      `Processing resume for user ${user.id}. Text length: ${resumeTextToProcess.length}`
    );
    const textChunks = chunkText(
      resumeTextToProcess,
      CHUNK_SIZE,
      CHUNK_OVERLAP
    );
    log(`Resume split into ${textChunks.length} chunks.`);
    totalChunksProcessed += textChunks.length;
    const resumeChunksToUpsert: ResumeChunkInsert[] = [];
    for (const chunk of textChunks) {
      if (chunk.trim().length === 0) continue;
      try {
        log(
          `[EmbeddingsV4] Generating embedding for resume chunk via AI service. Chunk: "${chunk.substring(
            0,
            50
          )}..."`
        );
        const embedding = await getEmbeddingFromAI(chunk);
        const userSpecificChunkId = generateDeterministicId(
          user.id + "::" + chunk
        );
        resumeChunksToUpsert.push({
          id: userSpecificChunkId,
          user_id: user.id,
          resume_text_content: chunk,
          embedding,
        });
      } catch (e: any) {
        log(
          `[EmbeddingsV4] Failed to generate embedding for a resume chunk (via AI service). User: ${
            user.id
          }. Error: ${e.message}. Chunk start: "${chunk.substring(0, 50)}..."`
        );
      }
    }
    if (resumeChunksToUpsert.length > 0) {
      log(
        `Upserting ${resumeChunksToUpsert.length} resume chunks for user ${user.id}...`
      );
      const { error: upsertError } = await supabase
        .from("resume_chunks")
        .upsert(resumeChunksToUpsert as any, { onConflict: "id" });
      if (upsertError) {
        log(
          `Error upserting resume chunks for user ${user.id}: ${upsertError.message}`
        );
      } else {
        totalChunksUpserted += resumeChunksToUpsert.length;
        log(
          `Successfully upserted ${resumeChunksToUpsert.length} resume chunks for user ${user.id}.`
        );
      }
    }

    // New: Extract and blacklist company names from resume text
    log(
      `[EmbeddingsV4] Attempting to extract company names from resume text for user ${user.id}.`
    );
    try {
      const companyNames = await extractCompanyNamesFromText(
        resumeTextToProcess
      );
      if (companyNames.length > 0) {
        log(
          `[EmbeddingsV4] Extracted ${
            companyNames.length
          } company names: ${companyNames.join(", ")}`
        );
        const blacklistEntries: TablesInsert<"blacklist_companies">[] =
          companyNames.map((name) => ({
            user_id: user.id,
            company_name: name,
            reason: "Automatically blacklisted from uploaded résumé",
          }));

        log(
          `[EmbeddingsV4] Upserting ${blacklistEntries.length} company names to blacklist for user ${user.id}.`
        );
        const { error: blacklistError } = await supabase
          .from("blacklist_companies")
          .upsert(blacklistEntries, { onConflict: "user_id,company_name" }); // Leverages unique constraint

        if (blacklistError) {
          log(
            `[EmbeddingsV4] Error upserting company names to blacklist for user ${user.id}: ${blacklistError.message}`
          );
        } else {
          log(
            `[EmbeddingsV4] Successfully upserted/updated company names in blacklist for user ${user.id}.`
          );
        }
      } else {
        log(
          `[EmbeddingsV4] No company names extracted from resume text for user ${user.id}.`
        );
      }
    } catch (e: any) {
      log(
        `[EmbeddingsV4] Error during company name extraction or blacklisting for user ${user.id}: ${e.message}`
      );
    }
    // End of new block for company blacklisting
  } else {
    log(
      `No resume text to process for user ${user.id} (either no path, file not found, or PDF parsing failed/empty). Old chunks (if any) will not be deleted.`
    );
  }

  log(`Fetching FAQs for user ${user.id} from faq table...`);
  const { data: faqsData, error: faqsError } = await supabase
    .from("faq")
    .select("id, question, answer, user_id, created_at")
    .eq("user_id", user.id);

  if (faqsError) {
    log(`Error fetching FAQs for user ${user.id}: ${faqsError.message}`);
  }

  if (faqsData && faqsData.length > 0) {
    log(`Processing ${faqsData.length} FAQs for user ${user.id}.`);
    const faqChunksToUpsert: FaqChunkInsert[] = [];
    for (const faqItem of faqsData as DbFaqItem[]) {
      // Explicit cast here as .returns<T> was removed
      if (!faqItem.question || !faqItem.answer) {
        log(
          `Skipping FAQ item ${faqItem.id} due to missing question or answer.`
        );
        continue;
      }
      const faqFullText = `${faqItem.question}\n${faqItem.answer}`;
      log(
        `Processing FAQ item ${faqItem.id}. Text length: ${faqFullText.length}`
      );
      const textChunks = chunkText(faqFullText, CHUNK_SIZE, CHUNK_OVERLAP);
      log(`FAQ item ${faqItem.id} split into ${textChunks.length} chunks.`);
      totalChunksProcessed += textChunks.length;
      for (const chunk of textChunks) {
        if (chunk.trim().length === 0) continue;
        try {
          log(
            `[EmbeddingsV4] Generating embedding for FAQ chunk via AI service. Chunk: "${chunk.substring(
              0,
              50
            )}..."`
          );
          const embedding = await getEmbeddingFromAI(chunk);
          const id = generateDeterministicId(chunk);
          faqChunksToUpsert.push({
            id,
            user_id: user.id,
            faq_id: faqItem.id,
            chunk_text: chunk,
            embedding,
          });
        } catch (e: any) {
          log(
            `[EmbeddingsV4] Failed to generate embedding for an FAQ chunk (via AI service). User: ${
              user.id
            }, FAQ ID: ${faqItem.id}. Error: ${
              e.message
            }. Chunk start: "${chunk.substring(0, 50)}..."`
          );
        }
      }
    }
    if (faqChunksToUpsert.length > 0) {
      log(
        `Upserting ${faqChunksToUpsert.length} FAQ chunks for user ${user.id}...`
      );
      const { error: upsertError } = await supabase
        .from("faq_chunks")
        .upsert(faqChunksToUpsert as any, { onConflict: "id" });
      if (upsertError) {
        log(
          `Error upserting FAQ chunks for user ${user.id}: ${upsertError.message}`
        );
      } else {
        totalChunksUpserted += faqChunksToUpsert.length;
        log(
          `Successfully upserted ${faqChunksToUpsert.length} FAQ chunks for user ${user.id}.`
        );
      }
    }
  } else {
    log(`No FAQs to process for user ${user.id}.`);
  }
  log(
    `Embedding sync finished for user ${user.id}. Total chunks processed: ${totalChunksProcessed}, Total chunks upserted: ${totalChunksUpserted}.`
  );
  console.log(`Synced ${totalChunksUpserted} chunks for user ${user.id}.`);
}

async function runCli() {
  log("CLI mode: Parsing arguments...");
  const args = process.argv.slice(2);
  let userId: string | undefined = undefined;

  const userArgIndex = args.findIndex(
    (arg) => arg === "--user" || arg.startsWith("--user=")
  );

  if (userArgIndex !== -1) {
    const userArgValue = args[userArgIndex];
    if (userArgValue.startsWith("--user=")) {
      userId = userArgValue.split("=")[1];
    } else if (userArgValue === "--user" && args.length > userArgIndex + 1) {
      if (!args[userArgIndex + 1].startsWith("--")) {
        userId = args[userArgIndex + 1];
      }
    }
  }

  if (!userId || userId.trim() === "") {
    console.error("Error: Missing or invalid user ID.");
    console.error("Usage examples:");
    console.error("  npx ts-node agent/embeddings.ts --user=<USER_ID>");
    console.error(
      "  node --loader ts-node/esm agent/embeddings.ts --user <USER_ID>"
    );
    process.exit(1);
  }

  log(`CLI mode: User ID specified: ${userId}`);
  const user: UserProfile = {
    id: userId,
    name: "Test User CLI",
    email: "testcli@example.com",
  };
  try {
    log("CLI mode: Starting syncEmbeddings...");
    await syncEmbeddings(user);
    log("CLI mode: syncEmbeddings completed.");
  } catch (error: any) {
    log(
      `CLI mode: Error during embedding sync for user ${userId}: ${error.message}`
    );
    console.error(
      `Critical error during sync for user ${userId}:`,
      error.message
    );
    if (error.stack) {
      log(`CLI mode: Error stack: ${error.stack}`);
    }
    process.exit(1);
  }
}

// Determine if the script is being run directly
const scriptUrl = import.meta.url;
const mainScriptPath = process.argv[1];

log(
  `[Embeddings CLI Check] scriptUrl: ${scriptUrl}, mainScriptPath: ${mainScriptPath}`
);
try {
  const scriptPathname = new URL(scriptUrl).pathname;
  log(
    `[Embeddings CLI Check] scriptPathname: ${scriptPathname}, mainScriptPath: ${mainScriptPath}`
  );
  if (scriptUrl.startsWith("file:") && mainScriptPath === scriptPathname) {
    log(
      "CRITICAL: Agent embeddings script IS RUNNING IN CLI MODE during app load!"
    );
    runCli();
  } else {
    log(
      `[Embeddings CLI Check] Condition not met: (mainScriptPath === scriptPathname) is ${
        mainScriptPath === scriptPathname
      }. Not running CLI.`
    );
  }
} catch (e: any) {
  log(`[Embeddings CLI Check] Error during CLI check: ${e.message}`);
}
