# Seller WeChat Conversation Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make WeChat conversations player-operable: the player can type a broker reply, the system understands it as a business interaction, then settles relationship and next-step effects through a replayable receipt.

**Architecture:** AI is a conversation-understanding layer only. It receives a compressed `ConversationSceneInputPack`, returns a bounded `ConversationEffectProposal`, and application code settles the proposal into a `ConversationReceipt` that mutates local game state through explicit rules. UI renders typed player turns and recipient reactions from persisted receipt history.

**Tech Stack:** Vite, React, TypeScript, local `server.ts`, DeepSeek chat completions, existing selling-houses application/domain boundaries.

---

### Task 1: Core Conversation Contract

**Files:**
- Create: `src/selling-houses/core/world-state/conversation/models.ts`
- Modify: `src/selling-houses/domain/models.ts`

- [x] Add pure, frozen-friendly types for `ConversationSceneInputPack`, `ConversationEffectProposal`, `ConversationReceipt`, and `ConversationNextStepDraft`.
- [x] Add optional `wechatConversationHistory?: ConversationReceipt[]` to `GameState`.

### Task 2: Application Settlement

**Files:**
- Create: `src/selling-houses/application/wechatConversation.ts`
- Modify: `src/selling-houses/application/gameTransitions.ts`
- Modify: `src/selling-houses/application/useGame.ts`
- Modify: `src/selling-houses/application/gameState.ts`

- [x] Build a compressed scene pack from `GameState`, a visible `WechatMessage`, and player text.
- [x] Normalize AI proposals and provide a deterministic fallback.
- [x] Settle proposal into bounded deltas for trust, patience, urgency, price flexibility, and next-step drafts.
- [x] Append the receipt to `wechatConversationHistory`, add a journal/domain event, and update derived state.
- [x] Expose `handleSendWechatConversationReply` from `useGame`.

### Task 3: AI Understanding Endpoint

**Files:**
- Create: `src/selling-houses/interfaces/http/myWechatConversationHandlers.ts`
- Create: `src/selling-houses/infrastructure/myWechatConversationClient.ts`
- Modify: `server.ts`

- [x] Add `POST /api/selling-houses-wechat-turns`, authorized for `selling-houses`.
- [x] Use DeepSeek V4 Flash by default, with deterministic fallback on failure.
- [x] Validate JSON and never let model output directly mutate game state.

### Task 4: WeChat UI Interaction

**Files:**
- Modify: `src/selling-houses/application/projections/myWechatTypes.ts`
- Modify: `src/selling-houses/application/projections/myWechatProjection.ts`
- Modify: `src/selling-houses/ui/features/Dashboard.tsx`
- Modify: `src/selling-houses/SellingHousesWorkspace.tsx`
- Modify: `src/selling-houses/ui/features/MyWechatPanel.tsx`

- [x] Attach persisted conversation turns to visible WeChat messages.
- [x] Render player typed bubbles, recipient reaction bubbles, and a compact business effect strip.
- [x] Add a text input and send button in conversation detail.
- [x] Disable duplicate sends while AI/settlement is in flight.

### Task 5: Verification

**Files:**
- Existing verification scripts and browser page.

- [x] Run `npm run lint -- --pretty false`.
- [x] Run `npm run build`.
- [x] Verify `http://localhost:3000/seller?profile=wechat-reply-check` by typing in the selected WeChat conversation and confirming the persisted receipt affects the case.
