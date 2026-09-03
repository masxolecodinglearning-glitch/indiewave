const db = require("../config/db");

const MAX_CONTEXT_MESSAGES = 40;
const MAX_CONTEXT_CHARS = 24000;

function titleFromMessage(message) {
  const words = String(message || "")
    .trim()
    .replace(/[^\p{L}\p{N}\s'?-]/gu, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8);

  if (!words.length) return "New AI Conversation";
  const title = words.join(" ");
  return title.length > 80 ? `${title.slice(0, 77)}...` : title;
}

async function createConversation(userId, initialMessage = "") {
  const { rows } = await db.query(
    `INSERT INTO ai_conversations (user_id, title, last_message_at)
     VALUES ($1, $2, NOW())
     RETURNING *`,
    [userId, titleFromMessage(initialMessage)]
  );
  return rows[0];
}

async function saveSuccessfulTurn({ userId, conversationId, initialMessage, requestId, userMessage, assistantMessage }) {
  const client = await db.getClient();

  try {
    await client.query("BEGIN");

    if (requestId) {
      const existing = await client.query(
        `SELECT id, conversation_id
         FROM ai_messages
         WHERE user_id = $1 AND request_id = $2
         LIMIT 1
         FOR UPDATE`,
        [userId, requestId]
      );
      if (existing.rows[0]) {
        const assistant = await client.query(
          `SELECT content
           FROM ai_messages
           WHERE conversation_id = $1 AND role = 'assistant' AND id > $2
           ORDER BY id ASC LIMIT 1`,
          [existing.rows[0].conversation_id, existing.rows[0].id]
        );
        if (assistant.rows[0]) {
          await client.query("COMMIT");
          return {
            conversationId: existing.rows[0].conversation_id,
            response: assistant.rows[0].content,
            reused: true
          };
        }
        conversationId = existing.rows[0].conversation_id;
      }
    }

    let resolvedConversationId = conversationId;
    if (resolvedConversationId) {
      const conversation = await client.query(
        "SELECT id FROM ai_conversations WHERE id = $1 AND user_id = $2 FOR UPDATE",
        [resolvedConversationId, userId]
      );
      if (!conversation.rows[0]) {
        await client.query("ROLLBACK");
        return null;
      }
    } else {
      const conversation = await client.query(
        `INSERT INTO ai_conversations (user_id, title, last_message_at)
         VALUES ($1, $2, NOW())
         RETURNING id`,
        [userId, titleFromMessage(initialMessage)]
      );
      resolvedConversationId = conversation.rows[0].id;
    }

    await client.query(
      `INSERT INTO ai_messages (conversation_id, user_id, role, content, request_id)
       VALUES ($1, $2, 'user', $3, $4)
       ON CONFLICT (user_id, request_id) WHERE request_id IS NOT NULL DO NOTHING`,
      [resolvedConversationId, userId, userMessage, requestId || null]
    );

    const insertedUser = await client.query(
      `SELECT id FROM ai_messages
       WHERE conversation_id = $1 AND user_id = $2 AND role = 'user'
         AND content = $3 AND ($4::varchar IS NULL OR request_id = $4)
       ORDER BY id DESC LIMIT 1`,
      [resolvedConversationId, userId, userMessage, requestId || null]
    );
    if (!insertedUser.rows[0] && requestId) {
      const existing = await client.query(
        `SELECT id, conversation_id
         FROM ai_messages
         WHERE user_id = $1 AND request_id = $2
         LIMIT 1`,
        [userId, requestId]
      );
      if (existing.rows[0]) {
        const assistant = await client.query(
          `SELECT content
           FROM ai_messages
           WHERE conversation_id = $1 AND role = 'assistant' AND id > $2
           ORDER BY id ASC LIMIT 1`,
          [existing.rows[0].conversation_id, existing.rows[0].id]
        );
        if (assistant.rows[0]) {
          await client.query("COMMIT");
          return {
            conversationId: existing.rows[0].conversation_id,
            response: assistant.rows[0].content,
            reused: true
          };
        }
      }
    }
    if (!insertedUser.rows[0]) throw new Error("AI user message was not saved");

    const assistant = await client.query(
      `INSERT INTO ai_messages (conversation_id, user_id, role, content)
       VALUES ($1, $2, 'assistant', $3)
       RETURNING content`,
      [resolvedConversationId, userId, assistantMessage]
    );

    await client.query(
      `UPDATE ai_conversations
       SET last_message_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND user_id = $2`,
      [resolvedConversationId, userId]
    );

    await client.query("COMMIT");
    return {
      conversationId: resolvedConversationId,
      response: assistant.rows[0].content,
      reused: false
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function getConversation(userId, conversationId) {
  const { rows } = await db.query(
    `SELECT id, user_id, title, summary, summary_updated_at,
            last_message_at, created_at, updated_at
     FROM ai_conversations
     WHERE id = $1 AND user_id = $2`,
    [conversationId, userId]
  );
  return rows[0] || null;
}

async function listConversations(userId) {
  const { rows } = await db.query(
    `SELECT id, title, summary, summary_updated_at, last_message_at,
            created_at, updated_at
     FROM ai_conversations
     WHERE user_id = $1
     ORDER BY COALESCE(last_message_at, updated_at) DESC, id DESC`,
    [userId]
  );
  return rows;
}

async function addMessage({ userId, conversationId, role, content }) {
  const { rows } = await db.query(
    `INSERT INTO ai_messages (conversation_id, user_id, role, content)
     SELECT id, user_id, $3, $4
     FROM ai_conversations
     WHERE id = $1 AND user_id = $2
     RETURNING id, conversation_id, user_id, role, content, created_at`,
    [conversationId, userId, role, content]
  );

  if (!rows[0]) return null;

  await db.query(
    `UPDATE ai_conversations
     SET last_message_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND user_id = $2`,
    [conversationId, userId]
  );
  return rows[0];
}

async function getRecentMessages(userId, conversationId) {
  const { rows } = await db.query(
    `SELECT m.role, m.content, m.created_at
     FROM ai_messages m
     JOIN ai_conversations c ON c.id = m.conversation_id
     WHERE m.conversation_id = $1 AND m.user_id = $2 AND c.user_id = $2
     ORDER BY m.created_at DESC, m.id DESC
     LIMIT $3`,
    [conversationId, userId, MAX_CONTEXT_MESSAGES]
  );

  const selected = [];
  let characters = 0;
  for (const message of rows.reverse()) {
    if (characters + message.content.length > MAX_CONTEXT_CHARS) break;
    selected.push(message);
    characters += message.content.length;
  }
  return selected;
}

async function deleteConversation(userId, conversationId) {
  const result = await db.query(
    "DELETE FROM ai_conversations WHERE id = $1 AND user_id = $2",
    [conversationId, userId]
  );
  return result.rowCount > 0;
}

module.exports = {
  MAX_CONTEXT_CHARS,
  MAX_CONTEXT_MESSAGES,
  addMessage,
  createConversation,
  deleteConversation,
  getConversation,
  getRecentMessages,
  listConversations,
  saveSuccessfulTurn
};