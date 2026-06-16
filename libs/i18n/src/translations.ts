import type { Language } from '@app/models';

/**
 * Canonical English catalog. Its keys define the set of valid TranslationKey
 * values; every other language must provide the same keys (enforced by the
 * `Record<TranslationKey, string>` typing below).
 *
 * Placeholders use `{name}` syntax and are filled by `translate(...)`.
 * Markup (Telegram HTML `<b>`/`<i>`/`<code>`, emojis) is kept inside the
 * templates so each language can position it grammatically.
 */
export const en = {
  // Sensor attribute labels (used as {attribute}/{event} inside templates)
  'sensor.contactClosed': 'Contact Closed',
  'sensor.contactOpened': 'Contact Opened',
  'sensor.vibration': 'Vibration',
  'sensor.occupancy': 'Occupancy',
  'sensor.presence': 'Presence',
  'sensor.smoke': 'Smoke',
  'sensor.waterLeak': 'Water Leak',

  // Email — rule notifications
  'email.rule.subject': '🔔 Domotic AI - Rule: {ruleName}',
  'email.rule.body': '🏠 Home: {homeName}\n📋 Rule: {ruleName}\n\n💬 {event}',

  // Email — home connection
  'email.home.subjectConnected': '🟢 Domotic AI - Home Reconnected: {homeName}',
  'email.home.subjectDisconnected':
    '🔴 Domotic AI - Home Disconnected: {homeName}',
  'email.home.bodyConnected':
    '🏠 Home: {homeName}\n\n🟢 The home has reconnected.',
  'email.home.bodyDisconnected':
    '🏠 Home: {homeName}\n\n🔴 The home has disconnected.',

  // Email — sensor notifications
  'email.sensor.subject': '🔔 Domotic AI - {attribute} Detected',
  'email.sensor.body':
    '🏠 Home: {homeName}\n📱 Device: {deviceName}\n\n📈 {attribute} detected',

  // Email — per-type header titles (drive the accent banner)
  'email.rule.title': 'Rule triggered',
  'email.sensor.title': '{attribute} detected',
  'email.home.titleConnected': 'Home reconnected',
  'email.home.titleDisconnected': 'Home disconnected',

  // Email — static HTML chrome
  'email.chrome.title': 'Domotic AI - Notify',
  'email.chrome.cta': 'Open Domotic AI',
  'email.chrome.footer': 'This is an automatic message from Domotic AI',

  // Telegram — notifications (per-type layout)
  'telegram.rule':
    '⚡ <b>Rule triggered</b>\n━━━━━━━━━━━━━━\n🏠 <b>Home:</b> <code>{homeName}</code>\n📋 <b>Rule:</b> <code>{ruleName}</code>\n\n💬 {event}',
  'telegram.sensor':
    '📡 <b>Sensor alert</b>\n━━━━━━━━━━━━━━\n🏠 <b>Home:</b> <code>{homeName}</code>\n📱 <b>Device:</b> <code>{deviceName}</code>\n\n📈 <b>{attribute}</b>',
  'telegram.homeConnected':
    '🟢 <b>Home reconnected</b>\n━━━━━━━━━━━━━━\n🏠 <code>{homeName}</code>\n\n<i>The home is back online.</i>',
  'telegram.homeDisconnected':
    '🔴 <b>Home disconnected</b>\n━━━━━━━━━━━━━━\n🏠 <code>{homeName}</code>\n\n<i>The home has lost connection.</i>',

  // Telegram — bot interactive messages
  'telegram.bot.invalidCode':
    '❌ <b>Invalid or expired code</b>\n\nPlease generate a new verification code from the <b>Domotic AI</b> dashboard.',
  'telegram.bot.linkedSuccess':
    '✨ <b>Account Linked Successfully!</b>\n\nYou will now receive important notifications from <b>Domotic AI</b> directly in this chat. 🏠\n\n<i>You can manage your notification preferences in the dashboard.</i>',
  'telegram.bot.linkError':
    '⚠️ <b>Error Linking Account</b>\n\nSomething went wrong. Please try again later or contact support.',
  'telegram.bot.start':
    '👋 <b>Welcome to Domotic AI!</b>\n\nTo link your account and receive notifications:\n\n1️⃣ Go to the <b>Users</b> section in the dashboard.\n2️⃣ Click "Telegram" on your user profile.\n3️⃣ Copy the verification code and send the command.',
  'telegram.bot.aiInProgress':
    'Please wait for the previous request to complete.',
  'telegram.bot.accountLinked':
    '✅ <b>Account Linked</b>\n\nHello <b>{name}</b>! 👋\n\nYou are all set to receive notifications. 🔔 \n\nTo use AI features, configure your provider in the web dashboard.',
  'telegram.bot.notLinked':
    '🔒 <b>Account Not Linked</b>\n\nPlease use the <code>/verify</code> command followed by the code from your web dashboard to link your account.\n\nExample: <code>/verify 123456</code>',
} as const;

export type TranslationKey = keyof typeof en;

const es: Record<TranslationKey, string> = {
  'sensor.contactClosed': 'Contacto cerrado',
  'sensor.contactOpened': 'Contacto abierto',
  'sensor.vibration': 'Vibración',
  'sensor.occupancy': 'Ocupación',
  'sensor.presence': 'Presencia',
  'sensor.smoke': 'Humo',
  'sensor.waterLeak': 'Fuga de agua',

  'email.rule.subject': '🔔 Domotic AI - Regla: {ruleName}',
  'email.rule.body': '🏠 Hogar: {homeName}\n📋 Regla: {ruleName}\n\n💬 {event}',

  'email.home.subjectConnected':
    '🟢 Domotic AI - Hogar reconectado: {homeName}',
  'email.home.subjectDisconnected':
    '🔴 Domotic AI - Hogar desconectado: {homeName}',
  'email.home.bodyConnected':
    '🏠 Hogar: {homeName}\n\n🟢 El hogar se ha reconectado.',
  'email.home.bodyDisconnected':
    '🏠 Hogar: {homeName}\n\n🔴 El hogar se ha desconectado.',

  'email.sensor.subject': '🔔 Domotic AI - {attribute} detectado',
  'email.sensor.body':
    '🏠 Hogar: {homeName}\n📱 Dispositivo: {deviceName}\n\n📈 {attribute} detectado',

  'email.rule.title': 'Regla activada',
  'email.sensor.title': '{attribute} detectado',
  'email.home.titleConnected': 'Hogar reconectado',
  'email.home.titleDisconnected': 'Hogar desconectado',

  'email.chrome.title': 'Domotic AI - Notificación',
  'email.chrome.cta': 'Abrir Domotic AI',
  'email.chrome.footer': 'Este es un mensaje automático de Domotic AI',

  'telegram.rule':
    '⚡ <b>Regla activada</b>\n━━━━━━━━━━━━━━\n🏠 <b>Hogar:</b> <code>{homeName}</code>\n📋 <b>Regla:</b> <code>{ruleName}</code>\n\n💬 {event}',
  'telegram.sensor':
    '📡 <b>Alerta de sensor</b>\n━━━━━━━━━━━━━━\n🏠 <b>Hogar:</b> <code>{homeName}</code>\n📱 <b>Dispositivo:</b> <code>{deviceName}</code>\n\n📈 <b>{attribute}</b>',
  'telegram.homeConnected':
    '🟢 <b>Hogar reconectado</b>\n━━━━━━━━━━━━━━\n🏠 <code>{homeName}</code>\n\n<i>El hogar está de nuevo en línea.</i>',
  'telegram.homeDisconnected':
    '🔴 <b>Hogar desconectado</b>\n━━━━━━━━━━━━━━\n🏠 <code>{homeName}</code>\n\n<i>El hogar ha perdido la conexión.</i>',

  'telegram.bot.invalidCode':
    '❌ <b>Código no válido o caducado</b>\n\nGenera un nuevo código de verificación desde el panel de <b>Domotic AI</b>.',
  'telegram.bot.linkedSuccess':
    '✨ <b>¡Cuenta vinculada correctamente!</b>\n\nA partir de ahora recibirás notificaciones importantes de <b>Domotic AI</b> directamente en este chat. 🏠\n\n<i>Puedes gestionar tus preferencias de notificación en el panel.</i>',
  'telegram.bot.linkError':
    '⚠️ <b>Error al vincular la cuenta</b>\n\nAlgo salió mal. Inténtalo de nuevo más tarde o contacta con soporte.',
  'telegram.bot.start':
    '👋 <b>¡Bienvenido a Domotic AI!</b>\n\nPara vincular tu cuenta y recibir notificaciones:\n\n1️⃣ Ve a la sección <b>Usuarios</b> en el panel.\n2️⃣ Pulsa "Telegram" en tu perfil de usuario.\n3️⃣ Copia el código de verificación y envía el comando.',
  'telegram.bot.aiInProgress': 'Espera a que termine la solicitud anterior.',
  'telegram.bot.accountLinked':
    '✅ <b>Cuenta vinculada</b>\n\n¡Hola <b>{name}</b>! 👋\n\nYa puedes recibir notificaciones. 🔔 \n\nPara usar las funciones de IA, configura tu proveedor en el panel web.',
  'telegram.bot.notLinked':
    '🔒 <b>Cuenta no vinculada</b>\n\nUsa el comando <code>/verify</code> seguido del código de tu panel web para vincular tu cuenta.\n\nEjemplo: <code>/verify 123456</code>',
};

const fr: Record<TranslationKey, string> = {
  'sensor.contactClosed': 'Contact fermé',
  'sensor.contactOpened': 'Contact ouvert',
  'sensor.vibration': 'Vibration',
  'sensor.occupancy': 'Occupation',
  'sensor.presence': 'Présence',
  'sensor.smoke': 'Fumée',
  'sensor.waterLeak': "Fuite d'eau",

  'email.rule.subject': '🔔 Domotic AI - Règle : {ruleName}',
  'email.rule.body':
    '🏠 Maison : {homeName}\n📋 Règle : {ruleName}\n\n💬 {event}',

  'email.home.subjectConnected':
    '🟢 Domotic AI - Maison reconnectée : {homeName}',
  'email.home.subjectDisconnected':
    '🔴 Domotic AI - Maison déconnectée : {homeName}',
  'email.home.bodyConnected':
    '🏠 Maison : {homeName}\n\n🟢 La maison s’est reconnectée.',
  'email.home.bodyDisconnected':
    '🏠 Maison : {homeName}\n\n🔴 La maison s’est déconnectée.',

  'email.sensor.subject': '🔔 Domotic AI - {attribute} détecté',
  'email.sensor.body':
    '🏠 Maison : {homeName}\n📱 Appareil : {deviceName}\n\n📈 {attribute} détecté',

  'email.rule.title': 'Règle déclenchée',
  'email.sensor.title': '{attribute} détecté',
  'email.home.titleConnected': 'Maison reconnectée',
  'email.home.titleDisconnected': 'Maison déconnectée',

  'email.chrome.title': 'Domotic AI - Notification',
  'email.chrome.cta': 'Ouvrir Domotic AI',
  'email.chrome.footer': 'Ceci est un message automatique de Domotic AI',

  'telegram.rule':
    '⚡ <b>Règle déclenchée</b>\n━━━━━━━━━━━━━━\n🏠 <b>Maison :</b> <code>{homeName}</code>\n📋 <b>Règle :</b> <code>{ruleName}</code>\n\n💬 {event}',
  'telegram.sensor':
    '📡 <b>Alerte de capteur</b>\n━━━━━━━━━━━━━━\n🏠 <b>Maison :</b> <code>{homeName}</code>\n📱 <b>Appareil :</b> <code>{deviceName}</code>\n\n📈 <b>{attribute}</b>',
  'telegram.homeConnected':
    '🟢 <b>Maison reconnectée</b>\n━━━━━━━━━━━━━━\n🏠 <code>{homeName}</code>\n\n<i>La maison est de nouveau en ligne.</i>',
  'telegram.homeDisconnected':
    '🔴 <b>Maison déconnectée</b>\n━━━━━━━━━━━━━━\n🏠 <code>{homeName}</code>\n\n<i>La maison a perdu la connexion.</i>',

  'telegram.bot.invalidCode':
    '❌ <b>Code invalide ou expiré</b>\n\nVeuillez générer un nouveau code de vérification depuis le tableau de bord <b>Domotic AI</b>.',
  'telegram.bot.linkedSuccess':
    '✨ <b>Compte associé avec succès !</b>\n\nVous recevrez désormais les notifications importantes de <b>Domotic AI</b> directement dans ce chat. 🏠\n\n<i>Vous pouvez gérer vos préférences de notification dans le tableau de bord.</i>',
  'telegram.bot.linkError':
    "⚠️ <b>Erreur lors de l'association du compte</b>\n\nUne erreur s'est produite. Veuillez réessayer plus tard ou contacter le support.",
  'telegram.bot.start':
    '👋 <b>Bienvenue sur Domotic AI !</b>\n\nPour associer votre compte et recevoir des notifications :\n\n1️⃣ Accédez à la section <b>Utilisateurs</b> du tableau de bord.\n2️⃣ Cliquez sur « Telegram » sur votre profil utilisateur.\n3️⃣ Copiez le code de vérification et envoyez la commande.',
  'telegram.bot.aiInProgress':
    'Veuillez attendre la fin de la requête précédente.',
  'telegram.bot.accountLinked':
    "✅ <b>Compte associé</b>\n\nBonjour <b>{name}</b> ! 👋\n\nVous êtes prêt à recevoir des notifications. 🔔 \n\nPour utiliser les fonctions d'IA, configurez votre fournisseur dans le tableau de bord web.",
  'telegram.bot.notLinked':
    '🔒 <b>Compte non associé</b>\n\nUtilisez la commande <code>/verify</code> suivie du code de votre tableau de bord web pour associer votre compte.\n\nExemple : <code>/verify 123456</code>',
};

export const CATALOGS: Record<Language, Record<TranslationKey, string>> = {
  en,
  es,
  fr,
};
