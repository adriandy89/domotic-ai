const a = 'abcdefghijklmnopqrstuvwxyz';
const b = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const c = '0123456789';

export function generateRandomPassword() {
  const minLength = 12;
  const maxLength = 16;
  const length =
    Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;

  let password = [
    a[Math.floor(Math.random() * a.length)],
    b[Math.floor(Math.random() * b.length)],
    c[Math.floor(Math.random() * c.length)],
  ];

  const allChars = a + b + c;
  while (password.length < length) {
    password.push(allChars[Math.floor(Math.random() * allChars.length)]);
  }

  // Barajar la contraseña
  for (let i = password.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [password[i], password[j]] = [password[j], password[i]];
  }

  return password.join('');
}

// Step 2: Encrypt the password with AES
export function encrypt(text: string): string {
  return generateRandomLetters(2) + Buffer.from(text).toString('base64');
}

// Step 3: Decrypt the password with AES
export function decrypt(encryptedText: string): string {
  return Buffer.from(encryptedText.slice(2), 'base64').toString('ascii');
}

function generateRandomLetters(length: number): string {
  const letters = a + b + c;
  let result = '';
  for (let i = 0; i < length; i++) {
    result += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  return result;
}
