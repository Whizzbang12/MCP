import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { DBGet } from "../db.js";
const eventsSchema = z.object({
    category: z
        .string()
        .optional()
        .describe("Optional event category, e.g. 'tech', 'social', 'workshop'. " +
        "Only include this if the user specifically mentioned a category."),
});
export const getEventsTool = tool(async (input) => {
    const { category } = input;
    const events = await DBGet("Events", undefined, undefined, ["Date", "asc"], 50);
    const filtered = category
        ? events.filter(e => (e["Category"] ?? "").toLowerCase() === category.trim().toLowerCase())
        : events;
    if (filtered.length === 0) {
        return category
            ? `No events found for category "${category}".`
            : "No upcoming events found.";
    }
    return filtered
        .map((e, i) => `${i + 1}. ${e["Name"] ?? "Unnamed Event"}\n` +
        `   Date: ${e["Date"] ?? "TBD"}\n` +
        `   Location: ${e["Location"] ?? "TBD"}\n` +
        `   Category: ${e["Category"] ?? "General"}\n` +
        `   Description: ${e["Description"] ?? "No description"}`)
        .join("\n\n");
}, {
    name: "get_events",
    description: "Fetches upcoming events and activities for ACM. " +
        "Use this when the user asks about events, tech events, social events, " +
        "workshops, the schedule, meetings, or any upcoming activities.",
    schema: eventsSchema,
});
