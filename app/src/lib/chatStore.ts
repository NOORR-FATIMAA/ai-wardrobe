import type { AssistantTurn } from './types';

// The stylist chat lives in memory for the app session only (never stored on the server),
// scoped to the signed-in user so a different account never sees it.
let conversation: { userId: string; turns: AssistantTurn[] } | null = null;

export function getConversation(userId: string): AssistantTurn[] {
  return conversation?.userId === userId ? conversation.turns : [];
}

export function storeConversation(userId: string, turns: AssistantTurn[]) {
  conversation = { userId, turns };
}
