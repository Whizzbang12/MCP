// src/mcp-server.ts
//
// This is the MCP server. It is the file that actually runs.
// Its job is to:
//   1. Create a server instance
//   2. Register tools on it (each tool = one thing the LLM can do)
//   3. Start listening for messages through stdin/stdout
//
// When your chatbot backend receives a user message, it sends
// that message to this server. The LLM reads the tool descriptions
// and decides which tool to call. This file runs the chosen tool
// and sends the result back to the LLM.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
// McpServer is the main class from the MCP SDK.
// You create one instance and register all your tools on it.
// No .js extension needed — we are using "module": "commonjs"
// in tsconfig which resolves imports without file extensions.

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio";
// StdioServerTransport handles the communication layer.
// "Stdio" means Standard Input/Output — the server receives
// messages through stdin (input pipe) and sends responses
// through stdout (output pipe).
// Your chatbot backend spawns this file as a child process
// and communicates through those pipes automatically.

import { z } from "zod";
// zod describes the parameters each tool accepts.
// The LLM reads these to understand what values it needs to
// provide when calling a tool.
// z.string() — parameter must be a string
// z.string().optional() — parameter can be left out entirely
// .describe("...") — adds an explanation the LLM uses to
// understand what the parameter is for

import { DBGet } from "./db";
// DBGet is the only database function needed here.
// All MCP tools are read-only — they fetch data and return it
// to the LLM so it can form a response.
// Write operations (DBCreate, DBUpdate, DBDelete) are not used
// here until you want the chatbot to modify data.


// ─────────────────────────────────────────────────────────────────────────────
// Create the server instance
//
// Think of this as registering the app. The name and version are
// labels that identify this server when a client connects to it.
// They show up in logs and the MCP Inspector tool.
// ─────────────────────────────────────────────────────────────────────────────
const server = new McpServer({
  name: "campus-club-chatbot",
  version: "1.0.0",
});


// ─────────────────────────────────────────────────────────────────────────────
// Tool 1: get_events
//
// Called when the user asks about events, workshops, the schedule,
// tech meetups, social nights, or any upcoming activities.
//
// server.tool() registers a tool. It takes 4 arguments:
//
//   Argument 1 — name (string)
//     The internal identifier for this tool. The LLM uses this
//     name when it decides to call the tool. Keep it lowercase
//     with underscores, no spaces.
//
//   Argument 2 — description (string)
//     THE MOST IMPORTANT PART OF THE WHOLE FILE.
//     The LLM reads this to decide whether this tool is the right
//     one for the user's message. If this is vague or wrong, the
//     LLM picks the wrong tool — or no tool at all.
//     Write it like you are explaining to a smart person exactly
//     when they should use this function.
//
//   Argument 3 — parameters (zod schema object)
//     Describes the inputs the LLM can pass to this tool.
//     The LLM figures out the values from the user's message.
//     For example: if the user says "any tech events?", the LLM
//     reads the description for category and sets it to "tech".
//
//   Argument 4 — handler (async function)
//     The actual code that runs when this tool is called.
//     It receives the parameters the LLM filled in.
//     It must return: { content: [{ type: "text", text: "..." }] }
//     The text you return is what the LLM reads to form its reply
//     to the user. You are not writing the user-facing message here —
//     you are writing the data the LLM will read and summarize.
// ─────────────────────────────────────────────────────────────────────────────
server.tool(
  "get_events",

  "Fetches upcoming events and activities for the campus club. " +
  "Use this when the user asks about events, tech events, social events, " +
  "workshops, the schedule, meetings, or any upcoming activities.",

  {
    category: z
      .string()
      .optional()
      .describe(
        "Optional event category, e.g. 'tech', 'social', 'workshop'. " +
        "Only include this if the user specifically mentioned a category."
      ),
  },

  async ({ category }) => {
    // category will be a string like "tech" if the LLM passed one,
    // or undefined if the user just said "events" with no category.

    const queries: [string, "==", string][] | undefined = category
      ? [["category", "==", category]]
      : undefined;
    // If we have a category, build a Firestore filter for it.
    // The explicit type annotation is needed because TypeScript
    // would otherwise infer "==" as type string, which does not
    // satisfy the comparisonOperator type in db.ts.

    const events = await DBGet(
      "Events",         // capital E — matches collectionNames in db.ts exactly
      queries,
      "and",
      ["date", "asc"],  // soonest events appear first
      10                // max 10 results — no need to send the LLM 100
    );

    if (events.length === 0) {
      // Always handle the empty case explicitly.
      // If we returned nothing with no explanation, the LLM
      // might try to make something up.
      return {
        content: [{
          type: "text",
          text: category
            ? `No events found for category "${category}".`
            : "No upcoming events found.",
        }],
      };
    }

    // Format the results into a readable string.
    // Bracket notation e["name"] is used instead of e.name
    // because DBObj uses an index signature ([key: string]: any),
    // and TypeScript requires bracket notation for those.
    // The ?? "fallback" handles documents that are missing a field
    // so we never return undefined to the LLM.
    const formatted = events
      .map((e, i) =>
        `${i + 1}. ${e["name"] ?? "Unnamed Event"}\n` +
        `   Date: ${e["date"] ?? "TBD"}\n` +
        `   Location: ${e["location"] ?? "TBD"}\n` +
        `   Category: ${e["category"] ?? "General"}\n` +
        `   Description: ${e["description"] ?? "No description"}`
      )
      .join("\n\n");
    // .join("\n\n") puts a blank line between each event
    // so the LLM can clearly distinguish one from the next.

    return {
      content: [{
        type: "text",
        text: `Upcoming events:\n\n${formatted}`,
      }],
    };
  }
);


// ─────────────────────────────────────────────────────────────────────────────
// Tool 2: search_faqs
//
// Called for general questions — how to join, the club mission,
// who leads it, contact info, meeting times, etc.
//
// This is the general fallback tool. It replaces the old
// "always hit the vector DB" behavior. The LLM only calls this
// when the user's question genuinely needs a knowledge base lookup
// and is not specifically about events.
//
// The keyword search inside can be swapped out for your existing
// vector DB call later — nothing else in this file needs to change
// when you do that.
// ─────────────────────────────────────────────────────────────────────────────
server.tool(
  "search_faqs",

  "Searches the campus club FAQ for general information about the organization. " +
  "Use this for questions about joining the club, the club mission, leadership, " +
  "contact info, dues, meeting times, or anything not covered by other tools. " +
  "Do NOT use this for questions about events or the schedule.",
  // The "Do NOT use" line is important. Without it the LLM might
  // call search_faqs for event questions too, which we don't want.

  {
    query: z
      .string()
      .describe("The user's question exactly as they asked it"),
  },

  async ({ query }) => {
    const faqs = await DBGet(
      "FAQ",        // all caps — matches collectionNames in db.ts exactly
      undefined,    // no filters — fetch all FAQs
      undefined,
      undefined,
      20            // cap at 20 so we don't send too much to the LLM
    );

    if (faqs.length === 0) {
      return {
        content: [{
          type: "text",
          text: "No FAQ information available. Please contact the club directly.",
        }],
      };
    }

    // Keyword matching: check if any word from the user's query
    // appears in each FAQ's question or answer text.
    // This works well for a small FAQ collection.
    //
    // To upgrade later: delete this block and replace it with
    // your vector DB semantic search call. The return statement
    // below stays exactly the same.
    const lowerQuery = query.toLowerCase();
    const relevant = faqs.filter(
      (faq) =>
        (faq["question"] ?? "").toLowerCase().includes(lowerQuery) ||
        (faq["answer"] ?? "").toLowerCase().includes(lowerQuery)
    );

    // If no keyword match was found, return the first 3 FAQs as
    // a fallback so the LLM always has something to work with.
    const results = relevant.length > 0 ? relevant : faqs.slice(0, 3);

    const formatted = results
      .map((faq) =>
        `Q: ${faq["question"] ?? "?"}\n` +
        `A: ${faq["answer"] ?? "No answer available"}`
      )
      .join("\n\n");

    return {
      content: [{
        type: "text",
        text: `Here is what I found:\n\n${formatted}`,
      }],
    };
  }
);


// ─────────────────────────────────────────────────────────────────────────────
// Start the server
//
// This is the entry point. When you run "npm start", Node.js runs
// this file and hits this function.
//
// StdioServerTransport() creates the communication channel.
// server.connect(transport) links the server to that channel
// and starts listening for incoming messages.
//
// From this point the server just waits. When your chatbot backend
// sends a user message through stdin, the server wakes up, the LLM
// picks a tool, the handler runs, and the result goes back through
// stdout.
//
// console.error is used instead of console.log for all status messages.
// This is intentional: stdout is reserved exclusively for MCP protocol
// messages. Anything written to stdout that is not a valid MCP message
// will break the communication. console.error writes to stderr, which
// is a completely separate output stream that does not interfere.
// ─────────────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Campus Club MCP server running...");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
  // process.exit(1) stops the process and signals to whatever
  // started it that something went wrong.
  // Exit code 1 = error. Exit code 0 = clean exit.
});