#!/usr/bin/env node

/**
 * Generate a secure random SESSION_SECRET for OAuth authentication
 * 
 * Usage:
 *   node generate-session-secret.js
 * 
 * This will generate a cryptographically secure random string
 * suitable for use as SESSION_SECRET in your .env file
 */

const crypto = require('crypto');

// Generate 32 random bytes and convert to hexadecimal
const secret = crypto.randomBytes(32).toString('hex');

console.log('='.repeat(60));
console.log('Generated SESSION_SECRET:');
console.log('='.repeat(60));
console.log(secret);
console.log('='.repeat(60));
console.log('\nAdd this to your .env file:');
console.log(`SESSION_SECRET=${secret}`);
console.log('\nIMPORTANT: Keep this secret safe and never commit it to git!');
console.log('='.repeat(60));
