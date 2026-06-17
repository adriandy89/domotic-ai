import type { SettingsNS } from '../en/settings';

export const settings: SettingsNS = {
  title: 'Paramètres',
  subtitle: 'Gérez votre profil et vos préférences',
  tabs: {
    general: 'Général',
    notifications: 'Notifications',
    integrations: 'Intégrations',
    energy: 'Énergie',
  },
  language: {
    title: 'Langue',
    description: "Langue utilisée pour l'interface et toutes vos notifications.",
    label: 'Langue',
    updated: 'Langue mise à jour',
    error: 'Impossible de mettre à jour la langue',
  },

  sessions: {
    title: 'Sessions actives',
    description_one: 'Vous avez {{count}} autre session active sur un autre navigateur.',
    description_other:
      'Vous avez {{count}} autres sessions actives sur d’autres navigateurs.',
    logout: 'Déconnecter l’autre navigateur',
    confirmTitle: 'Êtes-vous actif sur un autre navigateur ?',
    confirmDesc:
      'Cette action déconnectera tous les autres navigateurs connectés à votre compte. Vous resterez connecté sur ce navigateur.',
    loggingOut: 'Déconnexion...',
    logoutOthers: 'Déconnecter les autres',
  },

  notifications: {
    title: 'Notifications',
    description:
      'Configurez quels événements globaux de capteurs déclenchent des notifications.',
    updateError: 'Erreur lors de la mise à jour des attributs utilisateur',
    attributes: {
      contactTrue: 'Capteur de contact (fermé)',
      contactFalse: 'Capteur de contact (ouvert)',
      vibrationTrue: 'Vibration détectée',
      occupancyTrue: 'Occupation détectée',
      presenceTrue: 'Présence détectée',
      smokeTrue: 'Fumée détectée',
      waterLeakTrue: 'Fuite d’eau détectée',
    },
  },

  mcp: {
    title: 'Point de terminaison MCP',
    description:
      'Connectez Claude Desktop, Cursor ou tout client compatible MCP à votre maison connectée avec un token personnel.',
    endpointUrl: 'URL du point de terminaison',
    copyEndpoint: 'Copier l’URL du point de terminaison',
    copied: 'Copié.',
    personalTokens: 'Tokens personnels',
    tokensHint:
      'Chaque token authentifie un client. Révoquez n’importe quel token pour déconnecter ce client immédiatement.',
    newToken: 'Nouveau token',
    noTokens: 'Vous n’avez aucun token MCP actif.',
    createFirst: 'Créez votre premier token',
    lastUsed: 'Dernière utilisation : {{date}}',
    created: 'Créé : {{date}}',
    revoke: 'Révoquer',
    setupInstructions: 'Instructions de configuration',
    setupUrlOnly:
      '<b>Clients URL seule</b> (connecteur personnalisé Claude.ai, n8n, webhooks d’agents) : collez cette URL — le token voyage en paramètre de requête.',
    setupUrlOnlyNote:
      'Le token finit dans les journaux du serveur et l’historique du navigateur. Pour Claude Desktop / Cursor, préférez l’en-tête Bearer ci-dessous.',
    setupDesktop: '<b>Claude Desktop / Cursor</b> via <code>mcp-remote</code> :',
    setupInspector:
      '<b>MCP Inspector</b> : choisissez <em>Streamable HTTP</em>, pointez-le vers <code>{{url}}</code> et définissez l’en-tête <code>Authorization: Bearer …</code> ou ajoutez <code>?token=…</code> à l’URL.',
    createTitle: 'Créer un token MCP',
    createDesc: 'Donnez au token un nom reconnaissable (le client concerné).',
    namePlaceholder: 'p. ex. Claude Desktop',
    tokenCreated: 'Token créé',
    tokenCreatedDesc:
      'Copiez et stockez ce token maintenant. Nous ne l’afficherons plus — vous pourrez seulement le révoquer et en créer un nouveau.',
    tokenLabel: 'Token',
    showToken: 'Afficher le token',
    hideToken: 'Masquer le token',
    copyToken: 'Copier le token',
    urlWithToken: 'URL avec token (pour les clients URL seule)',
    copyUrl: 'Copier l’URL',
    urlPasteHint:
      'Collez ceci directement dans les connecteurs personnalisés Claude.ai, n8n, ou tout client qui n’accepte qu’une URL.',
    treatLikePassword:
      'Traitez ce token comme un mot de passe. Quiconque le possède peut agir sur votre maison connectée.',
    savedIt: 'Je l’ai enregistré',
    revokeTitle: 'Révoquer le token',
    revokeDesc:
      'Le client utilisant <b>{{name}}</b> sera déconnecté à sa prochaine requête. Cette action est irréversible.',
    loadError: 'Impossible de charger les tokens MCP',
    createError: 'Impossible de créer le token',
    revokeError: 'Impossible de révoquer le token',
  },

  xiaozhi: {
    title: 'Intégration Xiaozhi.me',
    description:
      'Laissez votre compte xiaozhi.me contrôler cette maison connectée via les mêmes outils sécurisés.',
    state: {
      idle: 'Inactif',
      connecting: 'Connexion…',
      connected: 'Connecté',
      error: 'Erreur',
    },
    outboundNote:
      'Chaque intégration est un WebSocket sortant de ce serveur vers xiaozhi.me.',
    newIntegration: 'Nouvelle intégration',
    noIntegrations: 'Aucune intégration Xiaozhi pour l’instant.',
    addFirst: 'Ajoutez votre première intégration',
    disabledSuffix: '(désactivée)',
    connectedAt: 'Connecté : {{date}}',
    createdAt: 'Créé : {{date}}',
    reconnect: 'Reconnecter / Tester',
    setupInstructions: 'Instructions de configuration',
    setupStep1:
      '1. Dans votre compte Xiaozhi.me, générez une URL de point de terminaison MCP — elle ressemble à <code>wss://api.xiaozhi.me/mcp/?token=…</code>.',
    setupStep2:
      '2. Collez-la dans « + Nouvelle intégration » ci-dessus. Le token est chiffré au repos avant d’être stocké.',
    setupStep3:
      '3. Une fois activée, ce serveur ouvre un WebSocket persistant vers xiaozhi et expose les 19 outils de la maison (appareils, capteurs, programmations, règles, télécommande IR, météo). Le LLM de Xiaozhi peut les appeler en votre nom.',
    setupSafety:
      'Sécurité : les outils incluent des actions destructrices (supprimer une programmation/règle, envoyer des commandes). Xiaozhi peut les invoquer sans confirmation par action. Désactivez ou supprimez l’intégration pour révoquer l’accès.',
    createTitle: 'Ajouter une intégration Xiaozhi',
    createDesc:
      'Donnez un nom à l’intégration et collez votre point de terminaison MCP xiaozhi.me.',
    namePlaceholder: 'p. ex. Xiaozhi du salon',
    endpointUrl: 'URL du point de terminaison',
    showEndpoint: 'Afficher le point de terminaison',
    hideEndpoint: 'Masquer le point de terminaison',
    deleteTitle: 'Supprimer l’intégration',
    deleteDesc:
      '« {{name}} » sera déconnectée et supprimée. Cette action est irréversible.',
    nameRequired: 'Le nom est obligatoire',
    endpointInvalid: 'Le point de terminaison doit être wss://api.xiaozhi.me/mcp/?token=…',
    loadError: 'Impossible de charger les intégrations Xiaozhi',
    createError: 'Impossible de créer l’intégration',
    updateError: 'Impossible de mettre à jour l’intégration',
    testError: 'Impossible de tester l’intégration',
    deleteError: 'Impossible de supprimer l’intégration',
  },

  ai: {
    title: 'Configuration de l’IA',
    description: 'Configurez le fournisseur d’IA pour votre organisation.',
    notSet: 'Non défini',
    noConfig: 'Aucune configuration d’IA trouvée',
    configure: 'Configurer l’IA',
    dialogDesc:
      'Choisissez un fournisseur et un modèle. Chaque organisation apporte sa propre clé d’API.',
    provider: 'Fournisseur',
    selectProvider: 'Sélectionner un fournisseur',
    model: 'Modèle',
    apiKey: 'Clé d’API',
    getKey: 'Obtenir une clé',
    showKey: 'Afficher la clé',
    hideKey: 'Masquer la clé',
    currentKeyPlaceholder: 'Actuelle : {{key}} (laissez vide pour conserver)',
    temperature: 'Température ({{value}})',
    maxTokens: 'Tokens de sortie max.',
    enableAi: 'Activer l’assistant IA',
    enableAiHint:
      'La désactiver arrête l’assistant de chat pour toute l’organisation.',
    saveConfig: 'Enregistrer la configuration',
    modelRequired: 'Le modèle est obligatoire.',
    openrouterPrefix:
      'Le modèle OpenRouter doit inclure le préfixe du fournisseur, p. ex. "anthropic/claude-haiku-4.5".',
    apiKeyRequired: 'La clé d’API est obligatoire.',
    temperatureRange: 'La température doit être comprise entre 0 et 2.',
    updateFailed: 'Impossible de mettre à jour la configuration de l’IA.',
  },

  tariff: {
    title: 'Tarif électrique',
    description:
      'Comment la consommation d’énergie est tarifée dans les rapports et l’e-mail mensuel.',
    pickHome: 'Choisir une maison…',
    modes: {
      fixedLabel: 'Prix fixe',
      fixedHint: 'Un seul prix €/kWh pour chaque heure',
      touLabel: 'Heures pleines/creuses',
      touHint: 'Périodes manuelles (p. ex. 2.0TD espagnol P1/P2/P3)',
      dynamicLabel: 'Dynamique (marché)',
      dynamicHint: 'Prix horaires d’une API publique (PVPC, ENTSO-E…)',
    },
    pricePerKwh: 'Prix par kWh',
    currency: 'Devise',
    timezone: 'Fuseau horaire',
    defaultPrice: 'Prix par défaut (aucune période correspondante)',
    loadPreset: 'Charger le préréglage 2.0TD espagnol',
    provider: 'Fournisseur',
    pickProvider: 'Choisir un fournisseur…',
    notConfigured: 'Non configuré',
    zone: 'Zone',
    pickZone: 'Choisir une zone…',
    fallbackPrice: 'Prix de repli par kWh',
    providersNeedToken:
      'Certains fournisseurs nécessitent un token d’API avant de pouvoir être sélectionnés.',
    configureProvidersBelow: 'Configurer les fournisseurs ci-dessous',
    providersNeedTokenUser:
      'Les fournisseurs grisés nécessitent un token d’API — demandez à un administrateur de les configurer dans Paramètres → Énergie.',
    marketHint:
      'Prix de marché horaires (terme d’énergie, hors taxes). Les heures sans données publiées utilisent le prix fixe ci-dessus et sont signalées comme estimations.',
    save: 'Enregistrer le tarif',
    onlyManagers: 'Seuls les gestionnaires peuvent modifier la configuration du tarif.',
    errorNoPeriods: 'Ajoutez au moins une période (ou chargez le préréglage 2.0TD).',
    errorPickProviderZone: 'Choisissez un fournisseur et une zone.',
    errorSaveFailed: 'Impossible d’enregistrer le tarif',
  },

  providers: {
    title: 'Fournisseurs de prix de marché',
    description:
      'Tokens d’API utilisés pour récupérer les prix de marché horaires (PVPC, ENTSO-E…) pour les tarifs dynamiques.',
    noProviders: 'Aucun fournisseur disponible',
    configured: 'Configuré',
    notConfigured: 'Non configuré',
    onlyAdmins: 'Seuls les administrateurs peuvent gérer les tokens des fournisseurs.',
  },

  providerRow: {
    rejected: 'Token rejeté',
    rejectedNote:
      'Le token enregistré a été rejeté par le fournisseur. Enregistrez-en un nouveau pour le réactiver.',
    activeToken: 'Token actif',
    fromEnv: ' · depuis une variable d’environnement',
    apiToken: 'Token d’API',
    currentTokenPlaceholder: 'Actuel : {{token}} (saisissez-en un nouveau pour le remplacer)',
    pasteToken: 'Collez le token…',
    showToken: 'Afficher le token',
    hideToken: 'Masquer le token',
    saveToken: 'Enregistrer le token',
    saveFailed: 'Impossible d’enregistrer le token. Réessayez.',
  },

  pricePreview: {
    currentPrice: 'Prix actuel',
    perKwh: '/ kWh',
    todayMin: 'Min aujourd’hui',
    todayMax: 'Max aujourd’hui',
    tomorrowPublished: 'Demain publié',
    tomorrowPending: 'Demain en attente',
  },

  touEditor: {
    labelPlaceholder: 'Libellé',
    periodName: 'Période {{n}}',
    addPeriod: 'Ajouter une période',
    overlap: '« {{a}} » chevauche « {{b}} » — la première période correspondante l’emporte',
  },
};
