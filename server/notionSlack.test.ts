import { describe, expect, it } from "vitest";
import {
  buildNotionAnswerPrompt,
  buildSlackMessage,
  summarizeNotionPayload,
} from "./notionSlack";

describe("Notion Slack update helpers", () => {
  it("summarizes common Notion webhook fields", () => {
    const summary = summarizeNotionPayload({
      type: "page.updated",
      page: { title: "Renewal notes", url: "https://notion.so/page" },
      user: { name: "Alice" },
    });

    expect(summary).toContain("Event: page.updated");
    expect(summary).toContain("Title: Renewal notes");
    expect(summary).toContain("URL: https://notion.so/page");
    expect(summary).toContain("Updated by: Alice");
  });

  it("builds a prompt with the five-minute ASAP instruction", () => {
    const prompt = buildNotionAnswerPrompt("Event: page.updated");

    expect(prompt).toContain("within 5 minutes");
    expect(prompt).toContain("Do not invent facts");
  });

  it("tags ChatGPT in the Slack message", () => {
    const message = buildSlackMessage("Answer body", "<@U0AR1F9B6RZ>");

    expect(message).toContain("<@U0AR1F9B6RZ>");
    expect(message).toContain("Notion was updated");
    expect(message).toContain("Answer body");
  });
});
