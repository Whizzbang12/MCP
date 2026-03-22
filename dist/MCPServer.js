import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { DBGet } from "./db.js";
const server = new McpServer({
    name: "acm-chatbot",
    version: "1.0.0",
});
server.tool("get_events", "Fetches upcoming events and activities for ACM. " +
    "Use this when the user asks about events, tech events, social events, " +
    "workshops, the schedule, meetings, or any upcoming activities.", {
    category: z
        .string()
        .optional()
        .describe("Optional event category, e.g. 'tech', 'social', 'workshop'. " +
        "Only include this if the user specifically mentioned a category."),
}, async ({ category }) => {
    // Fetch all events first, then filter in code
    // This avoids Firestore index requirements for "in" + orderBy
    const events = await DBGet("Events", undefined, undefined, ["Date", "asc"], 50);
    // If category provided, filter client-side (case-insensitive)
    const filtered = category
        ? events.filter(e => (e["Category"] ?? "").toLowerCase() === category.trim().toLowerCase())
        : events;
    if (filtered.length === 0) {
        return {
            content: [{
                    type: "text",
                    text: category
                        ? `No events found for category "${category}".`
                        : "No upcoming events found.",
                }],
        };
    }
    const formatted = filtered
        .map((e, i) => `${i + 1}. ${e["Name"] ?? "Unnamed Event"}\n` +
        `   Date: ${e["Date"] ?? "TBD"}\n` +
        `   Location: ${e["Location"] ?? "TBD"}\n` +
        `   Category: ${e["Category"] ?? "General"}\n` +
        `   Description: ${e["Description"] ?? "No description"}`)
        .join("\n\n");
    return {
        content: [{
                type: "text",
                text: `Upcoming events:\n\n${formatted}`,
            }],
    };
});
server.tool("search_faqs", "Searches the ACM FAQ for general information about the organization. " +
    "Use this for questions about joining the club, the club mission, leadership, " +
    "contact info, dues, meeting times, or anything not covered by other tools. " +
    "Do NOT use this for questions about events or the schedule.", {
    query: z
        .string()
        .describe("The user's question exactly as they asked it"),
}, async ({ query }) => {
    const faqs = await DBGet("FAQ", undefined, undefined, undefined, 20);
    if (faqs.length === 0) {
        return {
            content: [{
                    type: "text",
                    text: "No FAQ information available. Please contact the club directly.",
                }],
        };
    }
    // Split query into individual keywords and match any of them
    // This way "how to join" matches "How do I join the club?"
    const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const scored = faqs.map(faq => {
        const text = ((faq["Question"] ?? faq["question"] ?? "") + " " +
            (faq["Answer"] ?? faq["answer"] ?? "")).toLowerCase();
        const score = keywords.filter(kw => text.includes(kw)).length;
        return { faq, score };
    });
    // Sort by relevance score, take top matches
    const relevant = scored
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(s => s.faq);
    // Fall back to first 3 if nothing matched
    const results = relevant.length > 0 ? relevant.slice(0, 5) : faqs.slice(0, 3);
    const formatted = results
        .map((faq) => `Q: ${faq["Question"] ?? faq["question"] ?? "?"}\n` +
        `A: ${faq["Answer"] ?? faq["answer"] ?? "No answer available"}`)
        .join("\n\n");
    return {
        content: [{
                type: "text",
                text: `Here is what I found:\n\n${formatted}`,
            }],
    };
});
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("MCP server running...");
}
main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
