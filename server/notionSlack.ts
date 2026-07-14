import type { Request, Response } from "express";
import { invokeLLM } from "./_core/llm";

const MAX_NOTION_SUMMARY_CHARS = 6000;
const MAX_SLACK_TEXT_CHARS = 3900;

export type SlackNotifierConfig = {
  slackBotToken?: string;
  slackChannelId?: string;
  chatgptSlackMention?: string;
  notionWebhookSecret?: string;
};

type NotionWebhookBody = Record<string, unknown>;

const readConfig = (): SlackNotifierConfig => ({
  slackBotToken: process.env.SLACK_BOT_TOKEN,
  slackChannelId: process.env.SLACK_CHANNEL_ID,
  chatgptSlackMention: process.env.CHATGPT_SLACK_MENTION ?? "@ChatGPT",
  notionWebhookSecret: process.env.NOTION_WEBHOOK_SECRET,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringifySafe = (value: unknown): string => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const getNestedString = (
  body: NotionWebhookBody,
  keys: string[]
): string | undefined => {
  let current: unknown = body;
  for (const key of keys) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return typeof current === "string" && current.trim().length > 0
    ? current.trim()
    : undefined;
};

export function summarizeNotionPayload(body: NotionWebhookBody): string {
  const title =
    getNestedString(body, ["page", "title"]) ??
    getNestedString(body, ["data", "title"]) ??
    getNestedString(body, ["title"]);
  const url =
    getNestedString(body, ["page", "url"]) ??
    getNestedString(body, ["data", "url"]) ??
    getNestedString(body, ["url"]);
  const eventType =
    getNestedString(body, ["type"]) ??
    getNestedString(body, ["event", "type"]) ??
    "notion_update";
  const updatedBy =
    getNestedString(body, ["user", "name"]) ??
    getNestedString(body, ["updated_by", "name"]) ??
    getNestedString(body, ["actor", "name"]);

  const fields = [
    `Event: ${eventType}`,
    title ? `Title: ${title}` : undefined,
    url ? `URL: ${url}` : undefined,
    updatedBy ? `Updated by: ${updatedBy}` : undefined,
  ].filter(Boolean);

  const raw = stringifySafe(body);
  const clippedRaw =
    raw.length > MAX_NOTION_SUMMARY_CHARS
      ? `${raw.slice(0, MAX_NOTION_SUMMARY_CHARS)}\n…[truncated]`
      : raw;

  return `${fields.join("\n")}\n\nRaw Notion payload:\n${clippedRaw}`;
}

export function buildNotionAnswerPrompt(notionSummary: string): string {
  return [
    "A Notion page/database was updated and the team needs an ASAP Slack-ready answer within 5 minutes.",
    "Summarize what changed, call out likely action items, and ask concise follow-up questions if the update is ambiguous.",
    "Keep the response under 8 short bullets and make it immediately usable in Slack.",
    "Do not invent facts that are not present in the Notion update.",
    "",
    notionSummary,
  ].join("\n");
}

export async function generateNotionAnswer(
  body: NotionWebhookBody
): Promise<string> {
  const notionSummary = summarizeNotionPayload(body);
  const result = await invokeLLM({
    messages: [
      {
        role: "system",
        content:
          "You are ChatGPT helping a team react quickly to Notion updates posted into Slack.",
      },
      { role: "user", content: buildNotionAnswerPrompt(notionSummary) },
    ],
  });

  const content = result.choices[0]?.message.content;
  if (typeof content === "string" && content.trim().length > 0) {
    return content.trim();
  }

  return "I saw a Notion update, but I could not generate a detailed answer from the payload.";
}

export function buildSlackMessage(
  answer: string,
  mention = "@ChatGPT"
): string {
  const clippedAnswer =
    answer.length > MAX_SLACK_TEXT_CHARS
      ? `${answer.slice(0, MAX_SLACK_TEXT_CHARS)}\n…[truncated]`
      : answer;
  return `${mention} Notion was updated. Here is the ASAP generated answer:\n\n${clippedAnswer}`;
}

export async function postSlackMessage(
  text: string,
  config = readConfig()
): Promise<void> {
  if (!config.slackBotToken || !config.slackChannelId) {
    throw new Error("SLACK_BOT_TOKEN and SLACK_CHANNEL_ID must be configured.");
  }

  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.slackBotToken}`,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      channel: config.slackChannelId,
      text,
      unfurl_links: false,
      unfurl_media: false,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
  };
  if (!response.ok || !payload.ok) {
    throw new Error(
      `Slack post failed: ${response.status} ${payload.error ?? response.statusText}`
    );
  }
}

export async function handleNotionSlackUpdate(req: Request, res: Response) {
  const config = readConfig();
  const expectedSecret = config.notionWebhookSecret;
  if (expectedSecret) {
    const receivedSecret =
      req.header("x-notion-webhook-secret") ??
      req.header("authorization")?.replace(/^Bearer\s+/i, "");
    if (receivedSecret !== expectedSecret) {
      return res.status(401).json({ error: "invalid-notion-webhook-secret" });
    }
  }

  const body = isRecord(req.body) ? req.body : { payload: req.body };
  res.status(202).json({ ok: true, status: "accepted" });

  void (async () => {
    try {
      const answer = await generateNotionAnswer(body);
      await postSlackMessage(
        buildSlackMessage(answer, config.chatgptSlackMention),
        config
      );
    } catch (error) {
      console.error("[NotionSlack] Failed to process Notion update:", error);
    }
  })();
}
