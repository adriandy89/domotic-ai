import { SessionUser } from '@app/models';
import 'express-session';

declare module 'express-session' {
  interface SessionData {
    passport?: {
      user?: SessionUser;
    };
    // Post-login redirect target (same-origin path), e.g. the Alexa
    // account-linking /authorize URL. Consumed once by the OAuth callbacks.
    returnTo?: string;
    // CSRF nonce for the Alexa consent form.
    alexaConsentNonce?: string;
  }
}
