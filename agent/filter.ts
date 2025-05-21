import {
  UserProfile,
  JobListing,
  FilterScore,
  DecisionNode,
  BlacklistItem,
  ResumeChunk,
} from "../src/shared/types.ts";
import debug from "debug";
import { supabase } from "../src/lib/supabaseClient.ts";

const log = debug("jobbot:filter");
const SIMILARITY_THRESHOLD = 0.65;

// Placeholder for a function to fetch blacklist items
// In a real scenario, this would fetch from a database or a service
async function fetchBlacklistItems(userId: string): Promise<BlacklistItem[]> {
  log(
    `Fetching blacklist items for user ${userId} from Supabase table 'blacklist_companies'.`
  );

  try {
    const { data: blacklistData, error: blacklistError } = await supabase
      .from("blacklist_companies")
      .select("company_name") // Select only the company_name
      .eq("user_id", userId);

    if (blacklistError) {
      log(`Error fetching from blacklist_companies: ${blacklistError.message}`);
      return [];
    }

    if (blacklistData && blacklistData.length > 0) {
      log(
        `Found ${
          blacklistData.length
        } blacklisted companies in table: ${blacklistData
          .map((item) => item.company_name)
          .join(", ")}`
      );
      return blacklistData.map((item, index) => ({
        id: `bl-table-${index + 1}`, // Generate a simple ID
        type: "company",
        value: item.company_name, // company_name from the table
      }));
    } else {
      log(
        "No blacklisted companies found in blacklist_companies table for this user."
      );
      return [];
    }
  } catch (error: any) {
    log(`Exception fetching blacklist items from table: ${error.message}`);
    return [];
  }
}

// Placeholder for a function to get embeddings via ollama
async function getEmbedding(text: string): Promise<number[]> {
  log("Generating embedding for text:", text.substring(0, 50) + "...");
  // This would ideally be an API call to a service that runs ollama
  // For the purpose of this task, we'll simulate it.
  // In a real implementation, you'd use run_terminal_cmd or an HTTP client.
  // Example: const result = await runTerminalCmd('ollama embeddings -m nomic-embed-text --data "' + text + '"');
  // return JSON.parse(result.stdout).embedding;

  // Mocked embedding
  if (text.includes("blacklisted_job_description")) {
    return Array(768).fill(0.1);
  }
  if (text.includes("good_match_job_description")) {
    return Array(768).fill(0.5);
  }
  return Array(768).fill(0.2);
}

// Placeholder for a function to fetch resume chunks
// In a real scenario, this would fetch from Supabase or a similar vector DB
async function fetchSimilarResumeChunks(
  userId: string,
  jobEmbedding: number[],
  limit: number
): Promise<ResumeChunk[]> {
  log(
    `Fetching top ${limit} resume chunks for user ${userId} based on job embedding`
  );
  // Mock implementation: replace with actual Supabase query
  // Example: return await supabase.rpc('match_resume_chunks', { userId, embedding: jobEmbedding, match_threshold: 0.5, match_count: limit });

  // Mocked resume chunks
  const mockEmbeddingBase = jobEmbedding[0] || 0.2; // Use first element of job embedding to simulate some variance

  if (userId === "user_with_good_resume") {
    return [
      {
        id: "chunk1",
        userId,
        content: "Relevant experience in software development.",
        embedding: Array(768).fill(mockEmbeddingBase + 0.3), // Simulates higher similarity
      },
      {
        id: "chunk2",
        userId,
        content: "Experience with TypeScript and Node.js.",
        embedding: Array(768).fill(mockEmbeddingBase + 0.25),
      },
    ];
  }
  return [
    {
      id: "chunk_generic1",
      userId,
      content: "Generic skills.",
      embedding: Array(768).fill(mockEmbeddingBase - 0.1), // Simulates lower similarity
    },
  ];
}

// Cosine similarity function
export function cosineSimilarity(
  vecA: ReadonlyArray<number>,
  vecB: ReadonlyArray<number>
): number {
  if (vecA.length !== vecB.length || vecA.length === 0) {
    return 0;
  }
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function scoreJob(
  user: UserProfile,
  job: JobListing
): Promise<{ score: FilterScore; trace: DecisionNode }> {
  log(
    `Scoring job "${job.title}" from "${job.company}" for user "${user.name}"`
  );

  // 1. Blacklist gate
  const blacklistItems = await fetchBlacklistItems(user.id);
  const companyLower = job.company.toLowerCase();
  const isBlacklisted = blacklistItems.some(
    (item) =>
      item.type === "company" && companyLower.includes(item.value.toLowerCase())
  );
  log(
    isBlacklisted
      ? `Company "${job.company}" is blacklisted.`
      : `Company "${job.company}" is not blacklisted.`
  );

  // 2. Embedding gate
  let jobEmbedding: ReadonlyArray<number> = [];
  let similarity = 0;
  let topResumeChunks: ResumeChunk[] = [];

  if (!isBlacklisted) {
    jobEmbedding = await getEmbedding(job.description);
    topResumeChunks = await fetchSimilarResumeChunks(
      user.id,
      jobEmbedding as number[],
      10
    );

    if (topResumeChunks.length > 0) {
      similarity = Math.max(
        ...topResumeChunks.map((chunk) =>
          cosineSimilarity(jobEmbedding, chunk.embedding)
        )
      );
      log(`Max similarity with resume chunks: ${similarity.toFixed(4)}`);
    } else {
      log("No resume chunks found for similarity calculation.");
      similarity = 0;
    }
  } else {
    log("Skipping embedding gate due to blacklisting.");
  }

  // 3. Confidence calculation
  const confidence = isBlacklisted ? 0 : similarity;
  log(`Calculated confidence: ${confidence.toFixed(4)}`);

  // 4. Build trace JSON
  const trace: DecisionNode = {
    title: "Is company blacklisted?",
    pass: !isBlacklisted,
    children: [
      {
        title: `Similarity > ${SIMILARITY_THRESHOLD}`, // Using the constant
        pass: similarity >= SIMILARITY_THRESHOLD,
        children: [
          { title: "Confidence calculation", pass: true }, // This node always passes as it represents the calculation itself
        ],
      },
    ],
  };

  const filterScore: FilterScore = {
    jobListingId: job.id,
    score: confidence, // Per our earlier discussion, FilterScore.score is the confidence
    explanation: `Company Blacklisted: ${isBlacklisted}. Max Similarity: ${similarity.toFixed(
      4
    )}.`,
    similarity: similarity,
    blacklisted: isBlacklisted,
    confidence: confidence,
  };

  log("Job scoring complete. Score:", filterScore, "Trace:", trace);
  return { score: filterScore, trace };
}
