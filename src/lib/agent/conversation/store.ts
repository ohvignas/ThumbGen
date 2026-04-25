import { v4 as uuid } from "uuid";
import { getDb } from "@/lib/db";

export type Conversation = {
  id: string;
  project_id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content_json: string;
  interrupted: number;
  total_input_tokens: number;
  total_output_tokens: number;
  cost_estimate: number;
  created_at: string;
};

export type AppendMessageInput = Omit<Message, "id" | "created_at">;

export function createConversation(project_id: string, title = "Nouvelle conversation"): Conversation {
  const id = uuid();
  getDb()
    .prepare("INSERT INTO conversations (id, project_id, title) VALUES (?, ?, ?)")
    .run(id, project_id, title);
  return getConversation(id)!;
}

export function getConversation(id: string): Conversation | null {
  const row = getDb()
    .prepare("SELECT * FROM conversations WHERE id = ? AND deleted_at IS NULL")
    .get(id) as Conversation | undefined;
  return row ?? null;
}

export function listConversations(project_id: string): Conversation[] {
  return getDb()
    .prepare(
      "SELECT * FROM conversations WHERE project_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC",
    )
    .all(project_id) as Conversation[];
}

export function softDeleteConversation(id: string): void {
  getDb().prepare("UPDATE conversations SET deleted_at = datetime('now') WHERE id = ?").run(id);
}

export function updateConversationTitle(id: string, title: string): void {
  getDb()
    .prepare("UPDATE conversations SET title = ?, updated_at = datetime('now') WHERE id = ?")
    .run(title, id);
}

export function appendMessage(input: AppendMessageInput): Message {
  const id = uuid();
  getDb()
    .prepare(
      `INSERT INTO messages (id, conversation_id, role, content_json, interrupted, total_input_tokens, total_output_tokens, cost_estimate)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.conversation_id,
      input.role,
      input.content_json,
      input.interrupted,
      input.total_input_tokens,
      input.total_output_tokens,
      input.cost_estimate,
    );
  // Bump conversation updated_at so it sorts to the top of listConversations
  getDb()
    .prepare("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?")
    .run(input.conversation_id);
  return getDb().prepare("SELECT * FROM messages WHERE id = ?").get(id) as Message;
}

export function listMessages(conversation_id: string): Message[] {
  return getDb()
    .prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC")
    .all(conversation_id) as Message[];
}
