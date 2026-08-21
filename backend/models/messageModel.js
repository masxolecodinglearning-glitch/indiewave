const db = require("../config/db");

async function isParticipant(userId, conversationId) {
  const { rows } = await db.query(
    "SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2 LIMIT 1",
    [conversationId, userId]
  );
  return rows.length > 0;
}

async function getConversationRecipient(conversationId, senderId) {
  const { rows } = await db.query(
    `
      SELECT u.id, u.stage_name, u.name
      FROM conversation_participants cp
      JOIN users u ON u.id = cp.user_id
      WHERE cp.conversation_id = $1 AND cp.user_id <> $2
      LIMIT 1
    `,
    [conversationId, senderId]
  );

  return rows[0] || null;
}

async function getOrCreateConversation(userA, userB) {
  if (!userA || !userB || userA === userB) {
    throw new Error("A valid 1-to-1 conversation is required");
  }

  const client = await db.getClient();

  try {
    await client.query("BEGIN");

    const existing = await client.query(
      `
        SELECT c.id
        FROM conversations c
        JOIN conversation_participants cp1 ON cp1.conversation_id = c.id AND cp1.user_id = $1
        JOIN conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id = $2
        LIMIT 1
      `,
      [userA, userB]
    );

    if (existing.rows[0]) {
      await client.query("COMMIT");
      return { id: existing.rows[0].id };
    }

    const convo = await client.query(
      "INSERT INTO conversations DEFAULT VALUES RETURNING id"
    );
    const conversationId = convo.rows[0].id;

    await client.query(
      "INSERT INTO conversation_participants (conversation_id, user_id) VALUES ($1, $2), ($1, $3)",
      [conversationId, userA, userB]
    );

    await client.query("COMMIT");
    return { id: conversationId };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function listConversations(userId) {
  const { rows } = await db.query(
    `
      SELECT c.id, c.created_at,
        (
          SELECT m.message
          FROM messages m
          WHERE m.conversation_id = c.id
          ORDER BY m.created_at DESC
          LIMIT 1
        ) AS last_message,
        (
          SELECT m.created_at
          FROM messages m
          WHERE m.conversation_id = c.id
          ORDER BY m.created_at DESC
          LIMIT 1
        ) AS last_message_at,
        (
          SELECT COUNT(*)
          FROM messages m
          WHERE m.conversation_id = c.id
            AND m.sender_id <> $1
            AND m.read_at IS NULL
        ) AS unread_count
      FROM conversations c
      JOIN conversation_participants cp ON cp.conversation_id = c.id
      WHERE cp.user_id = $1
      ORDER BY last_message_at DESC NULLS LAST, c.created_at DESC
    `,
    [userId]
  );

  const conversations = [];
  for (const conversation of rows) {
    const otherUser = await db.query(
      `
        SELECT u.id, u.stage_name, u.profile_image
        FROM conversation_participants cp
        JOIN users u ON u.id = cp.user_id
        WHERE cp.conversation_id = $1 AND cp.user_id <> $2
        LIMIT 1
      `,
      [conversation.id, userId]
    );

    conversations.push({
      ...conversation,
      other_user: otherUser.rows[0] || null,
      unread_count: Number(conversation.unread_count || 0)
    });
  }

  return conversations;
}

async function getMessagesForConversation(userId, conversationId) {
  const allowed = await isParticipant(userId, conversationId);
  if (!allowed) {
    throw new Error("Conversation access denied");
  }

  const { rows } = await db.query(
    `
      SELECT m.id, m.conversation_id, m.sender_id, m.message, m.read_at, m.created_at,
             u.stage_name AS sender_name
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.conversation_id = $1
      ORDER BY m.created_at ASC
    `,
    [conversationId]
  );

  return rows;
}

async function sendMessage({ conversationId, senderId, message }) {
  const text = String(message || "").trim();
  if (!text) {
    throw new Error("Message cannot be empty");
  }

  const allowed = await isParticipant(senderId, conversationId);
  if (!allowed) {
    throw new Error("Conversation access denied");
  }

  const { rows } = await db.query(
    `
      INSERT INTO messages (conversation_id, sender_id, message)
      VALUES ($1, $2, $3)
      RETURNING *
    `,
    [conversationId, senderId, text]
  );

  return rows[0];
}

async function markConversationRead(userId, conversationId) {
  const allowed = await isParticipant(userId, conversationId);
  if (!allowed) {
    throw new Error("Conversation access denied");
  }

  const { rows } = await db.query(
    `
      UPDATE messages
      SET read_at = NOW()
      WHERE conversation_id = $1 AND sender_id <> $2 AND read_at IS NULL
      RETURNING *
    `,
    [conversationId, userId]
  );

  return rows;
}

module.exports = {
  isParticipant,
  getConversationRecipient,
  getOrCreateConversation,
  listConversations,
  getMessagesForConversation,
  sendMessage,
  markConversationRead
};
