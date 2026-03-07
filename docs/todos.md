# Telegram Group Chat With Shared Context on Vercel Chat + Vercel Queues

## Summary

This is feasible with the current Vercel stack, but not as a plug-and-play feature.

Based on the local Vercel sources you pointed to:

- The Vercel chat example already includes a Telegram adapter/webhook path and thread state support.
- Vercel Queues can reliably ingest and fan out chat events with retries.
- AI SDK chat state is application-owned: Vercel provides `UIMessage` and stream/persistence patterns, but not a built-in multi-bot group context manager.
- Vercel Queues does not provide strict FIFO ordering, so topic state and reply coordination must be handled in application logic.

Chosen defaults from our discussion:

- One shared arbiter/context service per Telegram chat
- The arbiter does not choose which bot replies
- One active topic per chat, with confidence-based topic switching
- Best-effort collision avoidance, not strict send locks

## Key Changes

### 1. Telegram ingestion and normalized event log

- Use the Telegram webhook adapter pattern from Vercel Chat as the ingress surface.
- Normalize every inbound Telegram message into a canonical chat event shape:
  - `chatId`
  - `thread/topic id` if Telegram exposes it for the message
  - `messageId`
  - `participantId`
  - `participantType` (`human` or `bot`)
  - `timestamp`
  - `text`
  - attachments/metadata
- Publish every normalized event to a Vercel Queue topic per chat or tenant namespace.
- Use message idempotency keys derived from Telegram update/message identity to prevent duplicate ingestion.

### 2. Shared context arbiter service

- Build a dedicated consumer whose only job is to maintain chat state, not reply.
- Persist per-chat state in durable storage outside the queue:
  - active topic summary
  - topic confidence
  - recent message window
  - candidate topic shift signals
  - last bot reply metadata
  - cooldown / anti-spam markers
- Treat AI SDK `UIMessage` as the app-level message state format for model-facing context, but keep a separate lightweight topic-state record for fast arbitration.
- On each queued message, the arbiter:
  - appends the event to chat history
  - updates the active-topic summary
  - detects whether the conversation has likely shifted topics
  - writes a fresh shared context snapshot that all bots can read

### 3. Bot participation protocol

- Each bot reads the latest shared context snapshot before deciding whether to respond.
- Bots evaluate independently against the same context using rules like:
  - relevance to active topic
  - whether a human is still actively typing/responding
  - whether another bot just replied
  - minimum novelty threshold
  - per-bot cooldown
- Bots do not respond to every message.
- Use best-effort anti-overlap rather than a hard lease:
  - each bot records an intent-to-reply with a short expiry
  - before posting, the bot rechecks whether a newer human message, topic shift, or other bot reply invalidates its reply
  - if stale, it drops the reply
- Keep reply generation asynchronous through Queues so Telegram webhook latency stays low.

### 4. Queue topology and delivery model

- Use one ingress topic for raw chat events.
- Add separate consumer groups for:
  - arbiter/context updater
  - bot evaluator(s)
  - observability/audit if needed
- Assume at-least-once delivery and approximate ordering:
  - all consumers must be idempotent
  - state updates must tolerate replay and out-of-order arrivals
- Use queue metadata plus stored sequence/timestamps to ignore already-applied or stale events.
- Do not rely on queue ordering for topic correctness.

### 5. Response delivery and user experience

- Post bot replies back into the Telegram group through the adapter.
- Prefer delayed/batched thinking over immediate replies:
  - small debounce window after new human activity
  - suppress bot replies when humans are actively exchanging short bursts
- The arbiter should publish a machine-readable context snapshot, not prose only, so bots can consume:
  - active topic
  - topic summary
  - recent speaker turns
  - whether discussion is cooling down or intensifying
  - recommended reply suppression signals
- Add observability for:
  - dropped stale replies
  - overlapping reply attempts
  - topic-change frequency
  - bot reply rate per chat
  - queue lag and retry counts

## Public Interfaces / Types

Define a small set of stable internal interfaces:

- `ChatEvent`
  - normalized inbound Telegram event
- `ChatContextSnapshot`
  - current active topic, summary, confidence, recent turn stats, suppression signals
- `BotIntent`
  - bot id, source message id, reason to reply, expiry, context version seen
- `BotReplyDecision`
  - `reply | skip | defer` plus reason and confidence
- `ChatState`
  - durable per-chat record combining event pointers, current topic, cooldowns, and last reply markers

The important boundary is:

- Queues move immutable events
- storage holds mutable shared context
- bots read context and publish intents/replies
- Telegram remains only the transport layer

## Test Plan

- Inbound duplicate Telegram updates do not create duplicate chat events or duplicate bot replies.
- Out-of-order queue delivery does not corrupt the active topic state.
- A burst of human messages updates the topic and suppresses premature bot replies.
- A new topic introduced by a participant replaces the previous active topic only after the configured confidence threshold is reached.
- Two bots deciding to reply at nearly the same time results in at most one final posted reply in the common case, and stale second replies are dropped before send.
- A bot that generated a reply against old context skips posting if a newer human message changes the topic.
- Bot cooldown rules prevent one bot from dominating the chat.
- Queue retries replay safely without double-applying state transitions.
- Telegram webhook latency remains low because all heavy processing happens asynchronously.

## Assumptions

- "Vercel Chat" here means using the Vercel chat adapter/example stack for Telegram transport, not a ready-made multi-agent orchestration product.
- The shared context manager is application code you will build; Vercel does not provide this abstraction out of the box.
- Best-effort anti-overlap is acceptable; exact conversational locking is out of scope for v1.
- One active topic per chat is enough for v1; parallel subtopic tracking is deferred.
- If stricter turn-taking becomes necessary later, the design can evolve by replacing bot intents with a short-lived posting lease without changing the ingress/context pipeline.
