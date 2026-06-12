import Anthropic from '@anthropic-ai/sdk';
import type { Tone } from './config';

const TONE_GUIDE: Record<Tone, string> = {
  educational: 'clear, informative, expert but approachable tone',
  funny: 'witty, meme-aware humor, still delivers real substance',
  threadboi: 'punchy growth-hacker style, bold hooks, strategic emoji (incl. 🧵)',
};

export function parseThreadJson(raw: string): string[] {
  const cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/```\s*$/m, '').trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('LLM output is not valid JSON');
  }
  if (!Array.isArray(parsed) || !parsed.every((t) => typeof t === 'string')) {
    throw new Error('LLM output is not a JSON array of strings');
  }
  return parsed.map((t: string) =>
    t.length > 280 ? `${t.slice(0, 277)}...` : t,
  );
}

export async function generateThread(
  topic: string, tone: Tone, length: number,
): Promise<string[]> {
  const anthropic = new Anthropic(); // doc ANTHROPIC_API_KEY tu env
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    system: [
      'You are an expert X (Twitter) thread writer.',
      'Return ONLY a JSON array of strings — one string per tweet.',
      'No markdown fences, no commentary, no numbering prefixes.',
      'Each tweet must be under 270 characters.',
      'Tweet 1 must be a strong hook. The last tweet wraps up with a takeaway or CTA.',
      'Write in the same language as the topic given by the user.',
    ].join(' '),
    messages: [{
      role: 'user',
      content: `Topic: ${topic}\nNumber of tweets: ${length}\nStyle: ${TONE_GUIDE[tone]}`,
    }],
  });
  const block = msg.content[0];
  if (block.type !== 'text') throw new Error('Unexpected LLM response type');
  return parseThreadJson(block.text);
}
