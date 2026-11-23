import { z } from 'zod';
import patterns from '../../patterns/patterns.json';
import privacyMd from '../../docs/privacy.md';

export interface Env {
  DB: D1Database;
  RATE_LIMITER?: RateLimit;
}

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const feedbackSchema = z.object({
  kind: z.enum(['false_positive', 'missed']),
  videoId: z.string().min(1),
  title: z.string(),
  channelHandle: z.string().nullable().optional(),
  matchedRuleIds: z.array(z.string()),
  score: z.number().int(),
  strictness: z.enum(['gentle', 'balanced', 'strict']),
  patternsRevision: z.number().int(),
  extensionVersion: z.string().min(1),
  browser: z.enum(['chrome', 'firefox']),
});

export type FeedbackPayload = z.infer<typeof feedbackSchema>;

export function renderMarkdownToHtml(markdown: string): string {
  const lines = markdown.split('\n');
  const body: string[] = [];
  let inList = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ')) {
      if (inList) {
        body.push('</ul>');
        inList = false;
      }
      body.push(`<h1>${escapeHtml(trimmed.slice(2))}</h1>`);
    } else if (trimmed.startsWith('## ')) {
      if (inList) {
        body.push('</ul>');
        inList = false;
      }
      body.push(`<h2>${escapeHtml(trimmed.slice(3))}</h2>`);
    } else if (trimmed.startsWith('### ')) {
      if (inList) {
        body.push('</ul>');
        inList = false;
      }
      body.push(`<h3>${escapeHtml(trimmed.slice(4))}</h3>`);
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (!inList) {
        body.push('<ul>');
        inList = true;
      }
      body.push(`<li>${renderInline(trimmed.slice(2))}</li>`);
    } else if (trimmed.length > 0) {
      if (inList) {
        body.push('</ul>');
        inList = false;
      }
      body.push(`<p>${renderInline(trimmed)}</p>`);
    } else {
      if (inList) {
        body.push('</ul>');
        inList = false;
      }
    }
  }
  if (inList) {
    body.push('</ul>');
    inList = false;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AlgoCleanse Privacy Policy</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.6; color: #333; }
    h1, h2, h3 { color: #111; }
  </style>
</head>
<body>
${body.join('\n')}
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderInline(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, '') || '/';

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    // GET /patterns.json
    if (pathname === '/patterns.json') {
      if (request.method !== 'GET') {
        return new Response('Method Not Allowed', {
          status: 405,
          headers: corsHeaders,
        });
      }
      return new Response(JSON.stringify(patterns), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300',
        },
      });
    }

    // GET /privacy
    if (pathname === '/privacy') {
      if (request.method !== 'GET') {
        return new Response('Method Not Allowed', {
          status: 405,
          headers: corsHeaders,
        });
      }
      const html = renderMarkdownToHtml(privacyMd);
      return new Response(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=UTF-8',
          'Cache-Control': 'public, max-age=300',
        },
      });
    }

    // POST /feedback
    if (pathname === '/feedback') {
      if (request.method !== 'POST') {
        return new Response('Method Not Allowed', {
          status: 405,
          headers: corsHeaders,
        });
      }

      // Rate limit check: 30 req/min per IP via Cloudflare rate limiting binding
      if (env.RATE_LIMITER) {
        const ip = request.headers.get('cf-connecting-ip') || 'unknown';
        const outcome = await env.RATE_LIMITER.limit({ key: ip });
        if (outcome && !outcome.success) {
          return new Response('Too Many Requests', {
            status: 429,
            headers: corsHeaders,
          });
        }
      }

      // Max 4 KB check
      const contentLength = request.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > 4096) {
        return new Response('Payload Too Large', {
          status: 413,
          headers: corsHeaders,
        });
      }

      const rawBody = await request.arrayBuffer();
      if (rawBody.byteLength > 4096) {
        return new Response('Payload Too Large', {
          status: 413,
          headers: corsHeaders,
        });
      }

      let body: unknown;
      try {
        const text = new TextDecoder().decode(rawBody);
        body = JSON.parse(text);
      } catch {
        return new Response('Invalid JSON', {
          status: 400,
          headers: corsHeaders,
        });
      }

      const parsed = feedbackSchema.safeParse(body);
      if (!parsed.success) {
        return new Response('Validation Error', {
          status: 400,
          headers: corsHeaders,
        });
      }

      const data = parsed.data;
      const receivedAt = new Date().toISOString();

      await env.DB.prepare(
        `INSERT INTO feedback (
          received_at,
          kind,
          video_id,
          title,
          channel_handle,
          matched_rule_ids,
          score,
          strictness,
          patterns_revision,
          extension_version,
          browser
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          receivedAt,
          data.kind,
          data.videoId,
          data.title,
          data.channelHandle ?? null,
          JSON.stringify(data.matchedRuleIds),
          data.score,
          data.strictness,
          data.patternsRevision,
          data.extensionVersion,
          data.browser,
        )
        .run();

      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    // Other paths 404
    return new Response('Not Found', {
      status: 404,
      headers: corsHeaders,
    });
  },
};
