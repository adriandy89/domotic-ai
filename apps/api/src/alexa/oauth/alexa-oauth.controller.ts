import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import * as crypto from 'crypto';
import type { Request, Response } from 'express';
import { AuthenticatedGuard } from '../../auth/guards';
import { AuthorizeDecisionDto } from './dto/authorize-decision.dto';
import { AlexaOAuthClientService } from './alexa-oauth-client.service';
import { AlexaOAuthService, OAuthGrantError } from './alexa-oauth.service';

const DECISION_PATH = '/api/v1/alexa/oauth/authorize/decision';

@ApiTags('Alexa')
@Controller('alexa/oauth')
export class AlexaOAuthController {
  constructor(
    private readonly clients: AlexaOAuthClientService,
    private readonly oauth: AlexaOAuthService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Account-linking entry point opened in the Alexa app's webview. Browser
   * session (cookie) auth — never bearer. Invalid client/redirect_uri must
   * render an error page, NOT redirect (RFC 6749 §4.1.2.1).
   */
  @Get('authorize')
  async authorize(@Req() req: Request, @Res() res: Response) {
    const q = req.query as Record<string, string | undefined>;
    const clientId = q.client_id ?? '';
    const redirectUri = q.redirect_uri ?? '';

    const client = await this.clients.findByClientId(clientId);
    if (!client || client.disabled) {
      return this.errorPage(res, 'Unknown or disabled client');
    }
    if (!client.redirect_uris.includes(redirectUri)) {
      return this.errorPage(res, 'redirect_uri is not in the allowlist');
    }
    if (q.response_type !== 'code') {
      return redirectWithError(
        res,
        redirectUri,
        'unsupported_response_type',
        q.state,
      );
    }

    if (!req.isAuthenticated()) {
      const loginUrl = new URL(
        '/login',
        this.config.getOrThrow<string>('PUBLIC_APP_URL'),
      );
      loginUrl.searchParams.set('next', req.originalUrl);
      return res.redirect(loginUrl.toString());
    }

    const nonce = crypto.randomBytes(16).toString('base64url');
    req.session.alexaConsentNonce = nonce;
    res
      .type('html')
      .send(
        consentPage({
          clientName: client.name,
          userEmail: req.user?.email ?? '',
          clientId,
          redirectUri,
          state: q.state,
          scope: q.scope,
          nonce,
        }),
      );
  }

  @Post('authorize/decision')
  @UseGuards(AuthenticatedGuard)
  async decision(
    @Req() req: Request,
    @Res() res: Response,
    @Body() dto: AuthorizeDecisionDto,
  ) {
    const expectedNonce = req.session.alexaConsentNonce;
    req.session.alexaConsentNonce = undefined;
    if (!expectedNonce || dto.nonce !== expectedNonce) {
      return this.errorPage(res, 'Invalid or expired consent form');
    }

    const client = await this.clients.findByClientId(dto.client_id);
    if (!client || client.disabled) {
      return this.errorPage(res, 'Unknown or disabled client');
    }
    if (!client.redirect_uris.includes(dto.redirect_uri)) {
      return this.errorPage(res, 'redirect_uri is not in the allowlist');
    }

    if (dto.decision !== 'allow') {
      return redirectWithError(res, dto.redirect_uri, 'access_denied', dto.state);
    }

    const code = await this.oauth.issueAuthCode({
      userId: req.user!.id,
      clientId: dto.client_id,
      redirectUri: dto.redirect_uri,
      scope: dto.scope,
    });
    const target = new URL(dto.redirect_uri);
    target.searchParams.set('code', code);
    if (dto.state) target.searchParams.set('state', dto.state);
    res.redirect(target.toString());
  }

  /**
   * Token endpoint. Client auth via HTTP Basic or body params; accepts
   * x-www-form-urlencoded (what Alexa sends) and JSON.
   */
  @Post('token')
  async token(@Req() req: Request, @Res() res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');

    const body = (req.body ?? {}) as Record<string, string | undefined>;
    const creds = clientCredentials(req, body);
    const client = creds
      ? await this.clients.validateClient(creds.id, creds.secret)
      : null;
    if (!client) {
      res.setHeader('WWW-Authenticate', 'Basic realm="alexa"');
      return res
        .status(401)
        .json({ error: 'invalid_client' as const });
    }

    try {
      switch (body.grant_type) {
        case 'authorization_code': {
          const pair = await this.oauth.exchangeAuthCode({
            clientId: client.client_id,
            code: body.code ?? '',
            redirectUri: body.redirect_uri ?? '',
          });
          return res.json(pair);
        }
        case 'refresh_token': {
          const pair = await this.oauth.refresh({
            clientId: client.client_id,
            refreshToken: body.refresh_token ?? '',
          });
          return res.json(pair);
        }
        default:
          throw new OAuthGrantError('unsupported_grant_type');
      }
    } catch (err) {
      if (err instanceof OAuthGrantError) {
        const status = err.error === 'invalid_client' ? 401 : 400;
        return res
          .status(status)
          .json({ error: err.error, error_description: err.description });
      }
      throw err;
    }
  }

  private errorPage(res: Response, message: string) {
    res
      .status(400)
      .type('html')
      .send(
        page(
          'Account linking error',
          `<p class="error">${escapeHtml(message)}</p>
           <p>Close this window and check the skill's account linking configuration.</p>`,
        ),
      );
  }
}

function clientCredentials(
  req: Request,
  body: Record<string, string | undefined>,
): { id: string; secret: string } | null {
  const header = req.header('authorization');
  if (header?.toLowerCase().startsWith('basic ')) {
    const decoded = Buffer.from(header.slice(6).trim(), 'base64').toString(
      'utf8',
    );
    const sep = decoded.indexOf(':');
    if (sep > 0) {
      return {
        id: decodeURIComponent(decoded.slice(0, sep)),
        secret: decodeURIComponent(decoded.slice(sep + 1)),
      };
    }
    return null;
  }
  if (body.client_id && body.client_secret) {
    return { id: body.client_id, secret: body.client_secret };
  }
  return null;
}

function redirectWithError(
  res: Response,
  redirectUri: string,
  error: string,
  state?: string,
) {
  const target = new URL(redirectUri);
  target.searchParams.set('error', error);
  if (state) target.searchParams.set('state', state);
  res.redirect(target.toString());
}

function consentPage(input: {
  clientName: string;
  userEmail: string;
  clientId: string;
  redirectUri: string;
  state?: string;
  scope?: string;
  nonce: string;
}): string {
  const hidden = (name: string, value?: string) =>
    value === undefined
      ? ''
      : `<input type="hidden" name="${name}" value="${escapeHtml(value)}" />`;
  return page(
    'Link your Alexa account',
    `<h1>Link Alexa</h1>
     <p><strong>${escapeHtml(input.clientName)}</strong> (Amazon Alexa) is asking
        for permission to discover and control the devices of
        <strong>${escapeHtml(input.userEmail)}</strong>.</p>
     <form method="post" action="${DECISION_PATH}">
       ${hidden('client_id', input.clientId)}
       ${hidden('redirect_uri', input.redirectUri)}
       ${hidden('state', input.state)}
       ${hidden('scope', input.scope)}
       ${hidden('nonce', input.nonce)}
       <div class="actions">
         <button type="submit" name="decision" value="allow" class="allow">Allow</button>
         <button type="submit" name="decision" value="deny" class="deny">Deny</button>
       </div>
     </form>`,
  );
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0f1117; color: #e5e7eb;
           display: flex; justify-content: center; padding: 3rem 1rem; }
    main { max-width: 26rem; background: #171a23; border: 1px solid #262b38;
           border-radius: 12px; padding: 2rem; }
    h1 { font-size: 1.25rem; margin-top: 0; }
    .error { color: #f87171; }
    .actions { display: flex; gap: 0.75rem; margin-top: 1.5rem; }
    button { flex: 1; padding: 0.6rem 1rem; border-radius: 8px; border: none;
             font-size: 1rem; cursor: pointer; }
    .allow { background: #6d5ef1; color: white; }
    .deny { background: transparent; color: #9ca3af; border: 1px solid #374151; }
  </style>
</head>
<body><main>${body}</main></body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
