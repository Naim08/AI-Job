import debug from "debug";
import { supabase } from "../src/lib/supabaseClient.ts";
import { embedFaqEntry } from "./embeddings.ts";

const log = debug("jobbot:faq");

export async function upsertFaq(
  userId: string,
  question: string,
  answer: string
): Promise<void> {
  if (answer.trim().length <= 8) {
    log(`Skipping FAQ upsert, answer too short: "${answer.trim()}"`);
    return;
  }

  log(`Upserting FAQ for user ${userId}. Q="${question.slice(0, 60)}..."`);

  const { data: upserted, error } = await supabase
    .from("faq")
    .upsert(
      {
        user_id: userId,
        question,
        answer,
        last_learned_at: new Date().toISOString(),
      },
      { onConflict: "user_id,question" }
    )
    .select("id")
    .single();

  if (error) {
    console.error("[FAQ] Error upserting FAQ:", error.message);
    return;
  }

  const faqId = upserted?.id;
  // Generate embedding for the FAQ entry
  if (faqId) {
    await embedFaqEntry({
      id: faqId,
      user_id: userId,
      question,
      answer,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  } else {
    log("Unable to retrieve faq.id after upsert; skipping embedding.");
  }

  // Debounce multiple upserts when called in tight loops
  await new Promise((r) => setTimeout(r, 300));
}
