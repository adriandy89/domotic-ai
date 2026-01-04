import { generateText } from 'ai';

interface TopicValidatorConfig {
  allowedTopics: string[];
  model: any;
  blockStrategy?: 'block' | 'warn';
  customMessage?: string;
  threshold?: number;
}

type MastraMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string | Array<{ type: string; text?: string;[key: string]: any }>;
};

/**
 * Topic Validator Processor
 * 
 * Input processor that validates messages are within allowed topics.
 * Blocks or warns about off-topic questions before they reach the LLM.
 * 
 * @example
 * ```typescript
 * new TopicValidatorProcessor({
 *   allowedTopics: ['smart home', 'home automation', 'devices', 'sensors'],
 *   model: openai('gpt-4o-mini'),
 *   blockStrategy: 'block',
 * })
 * ```
 */
export class TopicValidatorProcessor {
  readonly id = 'topic-validator';
  name = 'topic-validator';
  private config: Required<TopicValidatorConfig>;

  constructor(config: TopicValidatorConfig) {
    this.config = {
      blockStrategy: 'block',
      threshold: 0.7,
      customMessage: 'This question is outside my area of expertise.',
      ...config,
    } as Required<TopicValidatorConfig>;
  }

  /**
   * Process input messages - validates topic relevance
   */
  async processInputStep(args: {
    messages: any[];
    abort: (reason?: string) => never;
    tracingContext?: any;
  }): Promise<any[]> {
    const { messages, abort } = args;
    // Extract last user message
    const lastUserMessage = messages
      .filter((m) => m.role === 'user')
      .pop();

    if (!lastUserMessage) return messages;

    // Convert message content to text
    const userContent = this.extractTextContent(lastUserMessage);

    if (!userContent || userContent.trim().length === 0) {
      return messages;
    }

    // Check if message is on-topic
    const { isOnTopic, confidence, reasoning } = await this.checkTopicRelevance(userContent);

    console.log(`[TopicValidator] Message: "${userContent.substring(0, 50)}..."`);
    console.log(`[TopicValidator] On-topic: ${isOnTopic}, Confidence: ${confidence}, Reasoning: ${reasoning}`);

    if (!isOnTopic) {
      if (this.config.blockStrategy === 'block') {
        // Abort execution with custom message
        abort(this.buildRejectionMessage());
      } else if (this.config.blockStrategy === 'warn') {
        // Add warning system message
        return [
          ...messages,
          {
            role: 'system',
            content: `⚠️ TOPIC WARNING: User question may be off-topic (confidence: ${confidence}). ${reasoning}. Politely remind them you only handle: ${this.config.allowedTopics.join(', ')}.`,
          },
        ];
      }
    }

    return messages;
  }

  /**
   * Extracts text content from a message
   */
  private extractTextContent(message: MastraMessage): string {
    if (typeof message.content === 'string') {
      return message.content;
    }

    // Handle multimodal content (text, images, etc.)
    if (Array.isArray(message.content)) {
      return message.content
        .filter((part) => part.type === 'text')
        .map((part) => (part as any).text || '')
        .join(' ');
    }

    return '';
  }

  /**
   * Uses LLM to classify if message is related to allowed topics
   */
  private async checkTopicRelevance(
    userMessage: string,
  ): Promise<{ isOnTopic: boolean; confidence: number; reasoning: string }> {
    try {
      const result = await generateText({
        model: this.config.model,
        prompt: `You are a topic relevance classifier for a specialized AI assistant.

**Allowed Topics**: ${this.config.allowedTopics.join(', ')}

**User Message**: "${userMessage}"

**Task**: Determine if this message is CLEARLY related to ANY of the allowed topics.

**Rules**:
- Be strict: only classify as relevant if the message directly asks about or references the allowed topics
- Greetings alone ("hi", "hello") are OFF-TOPIC unless they mention the topics
- General questions unrelated to topics are OFF-TOPIC
- Questions that could apply to any system but mention allowed topics are ON-TOPIC
- Edge cases (might be related): classify as OFF-TOPIC to be safe

**Response Format** (JSON):
{
  "isOnTopic": true/false,
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation in English"
}

**Examples**:
- "Turn on the living room lights" → {"isOnTopic": true, "confidence": 0.98, "reasoning": "Directly asks about device control"}
- "What's the weather?" → {"isOnTopic": false, "confidence": 0.9, "reasoning": "General weather query, not home automation"}
- "Hello" → {"isOnTopic": false, "confidence": 0.85, "reasoning": "Generic greeting without topic reference"}
- "Show sensor data from bedroom" → {"isOnTopic": true, "confidence": 0.98, "reasoning": "Asks about sensors and devices"}
- "What's the temperature at home?" → {"isOnTopic": true, "confidence": 0.95, "reasoning": "Asks about sensor data"}
- "Create automation rule for lights" → {"isOnTopic": true, "confidence": 0.97, "reasoning": "Asks about automation rules"}

Respond ONLY with valid JSON.`,
      });

      // Parse JSON response
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('[TopicValidator] Failed to parse LLM response:', result.text);
        // Default to allowing message if classification fails
        return { isOnTopic: true, confidence: 0.5, reasoning: 'Classification failed, allowing message' };
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Apply threshold
      const isOnTopic = parsed.isOnTopic && parsed.confidence >= this.config.threshold!;

      return {
        isOnTopic,
        confidence: parsed.confidence,
        reasoning: parsed.reasoning || 'No reasoning provided',
      };
    } catch (error) {
      console.error('[TopicValidator] Error checking relevance:', error);
      // Default to allowing message if error occurs
      return { isOnTopic: true, confidence: 0.5, reasoning: 'Error in classification, allowing message' };
    }
  }

  /**
   * Builds a user-friendly rejection message
   */
  private buildRejectionMessage(): string {
    const baseMessage = this.config.customMessage || 'This question is outside my area of expertise.';

    return `${baseMessage}

I specialize in: ${this.config.allowedTopics.join(', ')}.

Your question seems to be outside this scope. Can I help you with something related to home automation or device control?`;
  }
}
