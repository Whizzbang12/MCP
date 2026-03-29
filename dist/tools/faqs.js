import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { DBGet } from "../db.js";
const faqsSchema = z.object({
    query: z.string().describe("The user's question exactly as they asked it"),
});
export const searchFaqsTool = tool(async (input) => {
    const { query } = input;
    const faqs = await DBGet("FAQ", undefined, undefined, undefined, 20);
    if (faqs.length === 0) {
        return "No FAQ information available. Please contact the club directly.";
    }
    const results = await searchVectorDB(query, faqs);
    return results
        .map((faq) => `Q: ${faq["Question"] ?? faq["question"] ?? "?"}\n` +
        `A: ${faq["Answer"] ?? faq["answer"] ?? "No answer available"}`)
        .join("\n\n");
}, {
    name: "search_faqs",
    description: "Searches the ACM FAQ for general information about the organization. " +
        "Use this for questions about joining the club, the club mission, leadership, " +
        "contact info, dues, meeting times, or anything not covered by other tools. " +
        "Do NOT use this for questions about events or the schedule.",
    schema: faqsSchema,
});
//This is for vectorDB
async function searchVectorDB(query, faqs) {
    const keywords = query
        .toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 2);
    const scored = faqs.map(faq => {
        const text = ((faq["Question"] ?? faq["question"] ?? "") + " " +
            (faq["Answer"] ?? faq["answer"] ?? "")).toLowerCase();
        const score = keywords.filter(kw => text.includes(kw)).length;
        return { faq, score };
    });
    const relevant = scored
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(s => s.faq);
    return relevant.length > 0 ? relevant.slice(0, 5) : faqs.slice(0, 3);
}
