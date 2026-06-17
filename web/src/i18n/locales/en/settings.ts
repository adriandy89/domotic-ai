export const settings = {
  title: 'Settings',
  subtitle: 'Manage your profile and preferences',
  tabs: {
    general: 'General',
    notifications: 'Notifications',
    integrations: 'Integrations',
    energy: 'Energy',
  },
  language: {
    title: 'Language',
    description:
      'Language used for the interface and all of your notifications.',
    label: 'Language',
    updated: 'Language updated',
    error: 'Could not update language',
  },

  sessions: {
    title: 'Active Sessions',
    description_one:
      'You have {{count}} other active session on another browser.',
    description_other:
      'You have {{count}} other active sessions on another browser.',
    logout: 'Log out other browser',
    confirmTitle: 'Are you active on another browser?',
    confirmDesc:
      'This action will log out all other browsers logged into your account. You will remain logged in on this browser.',
    loggingOut: 'Logging out...',
    logoutOthers: 'Log out others',
  },

  notifications: {
    title: 'Notifications',
    description: 'Configure which global sensor events trigger notifications.',
    updateError: 'Error updating user attributes',
    attributes: {
      contactTrue: 'Contact Sensor (Closed)',
      contactFalse: 'Contact Sensor (Open)',
      vibrationTrue: 'Vibration Detected',
      occupancyTrue: 'Occupancy Detected',
      presenceTrue: 'Presence Detected',
      smokeTrue: 'Smoke Detected',
      waterLeakTrue: 'Water Leak Detected',
    },
  },

  mcp: {
    title: 'MCP Endpoint',
    description:
      'Connect Claude Desktop, Cursor or any MCP-compatible client to your smart home with a personal token.',
    endpointUrl: 'Endpoint URL',
    copyEndpoint: 'Copy endpoint URL',
    copied: 'Copied.',
    personalTokens: 'Personal tokens',
    tokensHint:
      'Each token authenticates one client. Revoke any token to disconnect that client immediately.',
    newToken: 'New token',
    noTokens: 'You have no active MCP tokens.',
    createFirst: 'Create your first token',
    lastUsed: 'Last used: {{date}}',
    created: 'Created: {{date}}',
    revoke: 'Revoke',
    setupInstructions: 'Setup instructions',
    setupUrlOnly:
      '<b>URL-only clients</b> (Claude.ai custom connector, n8n, agent webhooks): paste this URL — the token travels as a query param.',
    setupUrlOnlyNote:
      'The token ends up in server logs and browser history. Prefer the Bearer header below for Claude Desktop / Cursor.',
    setupDesktop: '<b>Claude Desktop / Cursor</b> via <code>mcp-remote</code>:',
    setupInspector:
      '<b>MCP Inspector</b>: select <em>Streamable HTTP</em>, point it at <code>{{url}}</code> and either set header <code>Authorization: Bearer …</code> or append <code>?token=…</code> to the URL.',
    createTitle: 'Create MCP token',
    createDesc: "Give the token a recognisable name (the client it's for).",
    namePlaceholder: 'e.g. Claude Desktop',
    tokenCreated: 'Token created',
    tokenCreatedDesc:
      "Copy and store this token now. We won't show it again — you'll only be able to revoke it and create a new one.",
    tokenLabel: 'Token',
    showToken: 'Show token',
    hideToken: 'Hide token',
    copyToken: 'Copy token',
    urlWithToken: 'URL with token (for URL-only clients)',
    copyUrl: 'Copy URL',
    urlPasteHint:
      'Paste this directly into Claude.ai custom connectors, n8n, or any client that only accepts a URL.',
    treatLikePassword:
      'Treat this token like a password. Anyone with it can act on your smart home.',
    savedIt: "I've saved it",
    revokeTitle: 'Revoke token',
    revokeDesc:
      'The client using <b>{{name}}</b> will be disconnected on its next request. This cannot be undone.',
    loadError: 'Could not load MCP tokens',
    createError: 'Could not create token',
    revokeError: 'Could not revoke token',
  },

  xiaozhi: {
    title: 'Xiaozhi.me Integration',
    description:
      'Let your xiaozhi.me account control this smart home through the same secure tools.',
    state: {
      idle: 'Idle',
      connecting: 'Connecting…',
      connected: 'Connected',
      error: 'Error',
    },
    outboundNote:
      'Each integration is one outbound WebSocket from this server to xiaozhi.me.',
    newIntegration: 'New integration',
    noIntegrations: 'No Xiaozhi integrations yet.',
    addFirst: 'Add your first integration',
    disabledSuffix: '(disabled)',
    connectedAt: 'Connected: {{date}}',
    createdAt: 'Created: {{date}}',
    reconnect: 'Reconnect / Test',
    setupInstructions: 'Setup instructions',
    setupStep1:
      '1. In your Xiaozhi.me account, generate an MCP endpoint URL — it looks like <code>wss://api.xiaozhi.me/mcp/?token=…</code>.',
    setupStep2:
      '2. Paste it into "+ New integration" above. The token is encrypted at rest before being stored.',
    setupStep3:
      "3. Once enabled, this server opens a long-lived WebSocket to xiaozhi and exposes the 19 smart-home tools (devices, sensors, schedules, rules, IR remote, weather). Xiaozhi's LLM can call them on your behalf.",
    setupSafety:
      'Safety: tools include destructive actions (delete schedule/rule, send commands). xiaozhi may invoke them without per-action confirmation. Disable or delete the integration to revoke access.',
    createTitle: 'Add Xiaozhi integration',
    createDesc:
      'Give the integration a name and paste your xiaozhi.me MCP endpoint.',
    namePlaceholder: 'e.g. Living-room xiaozhi',
    endpointUrl: 'Endpoint URL',
    showEndpoint: 'Show endpoint',
    hideEndpoint: 'Hide endpoint',
    deleteTitle: 'Delete integration',
    deleteDesc:
      '"{{name}}" will be disconnected and deleted. This cannot be undone.',
    nameRequired: 'Name is required',
    endpointInvalid: 'Endpoint must be wss://api.xiaozhi.me/mcp/?token=…',
    loadError: 'Could not load Xiaozhi integrations',
    createError: 'Could not create integration',
    updateError: 'Could not update integration',
    testError: 'Could not test integration',
    deleteError: 'Could not delete integration',
  },

  ai: {
    title: 'AI Configuration',
    description: 'Configure the AI provider for your organization.',
    notSet: 'Not set',
    noConfig: 'No AI configuration found',
    configure: 'Configure AI',
    dialogDesc:
      'Pick a provider and model. Each organization brings its own API key.',
    provider: 'Provider',
    selectProvider: 'Select provider',
    model: 'Model',
    apiKey: 'API Key',
    getKey: 'Get a key',
    showKey: 'Show key',
    hideKey: 'Hide key',
    currentKeyPlaceholder: 'Current: {{key}} (leave empty to keep)',
    temperature: 'Temperature ({{value}})',
    maxTokens: 'Max output tokens',
    enableAi: 'Enable AI Assistant',
    enableAiHint:
      'Disabling stops the chat assistant for the whole organization.',
    saveConfig: 'Save Configuration',
    modelRequired: 'Model is required.',
    openrouterPrefix:
      'OpenRouter model must include vendor prefix, e.g. "anthropic/claude-haiku-4.5".',
    apiKeyRequired: 'API key is required.',
    temperatureRange: 'Temperature must be between 0 and 2.',
    updateFailed: 'Failed to update AI configuration.',
  },

  tariff: {
    title: 'Electricity tariff',
    description:
      'How energy consumption is priced in reports and the monthly email.',
    pickHome: 'Pick a home…',
    modes: {
      fixedLabel: 'Fixed price',
      fixedHint: 'One €/kWh price for every hour',
      touLabel: 'Time of use',
      touHint: 'Manual periods (e.g. Spanish 2.0TD P1/P2/P3)',
      dynamicLabel: 'Dynamic (market)',
      dynamicHint: 'Hourly prices from a public API (PVPC, ENTSO-E…)',
    },
    pricePerKwh: 'Price per kWh',
    currency: 'Currency',
    timezone: 'Timezone',
    defaultPrice: 'Default price (no period match)',
    loadPreset: 'Load Spanish 2.0TD preset',
    provider: 'Provider',
    pickProvider: 'Pick a provider…',
    notConfigured: 'Not configured',
    zone: 'Zone',
    pickZone: 'Pick a zone…',
    fallbackPrice: 'Fallback price per kWh',
    providersNeedToken: 'Some providers need an API token before they can be selected.',
    configureProvidersBelow: 'Configure providers below',
    providersNeedTokenUser:
      'Greyed-out providers need an API token — ask an administrator to configure them in Settings → Energy.',
    marketHint:
      'Hourly market prices (energy term, taxes excluded). Hours without published data fall back to the fixed price above and are flagged as estimates.',
    save: 'Save tariff',
    onlyManagers: 'Only managers can change the tariff configuration.',
    errorNoPeriods: 'Add at least one period (or load the 2.0TD preset).',
    errorPickProviderZone: 'Pick a provider and zone.',
    errorSaveFailed: 'Failed to save tariff',
  },

  providers: {
    title: 'Market price providers',
    description:
      'API tokens used to fetch hourly market prices (PVPC, ENTSO-E…) for dynamic tariffs.',
    noProviders: 'No providers available',
    configured: 'Configured',
    notConfigured: 'Not configured',
    onlyAdmins: 'Only administrators can manage provider tokens.',
  },

  providerRow: {
    rejected: 'Token rejected',
    rejectedNote:
      'The saved token was rejected by the provider. Save a new one to re-enable it.',
    activeToken: 'Active token',
    fromEnv: ' · from environment variable',
    apiToken: 'API token',
    currentTokenPlaceholder: 'Current: {{token}} (enter new to replace)',
    pasteToken: 'Paste token…',
    showToken: 'Show token',
    hideToken: 'Hide token',
    saveToken: 'Save token',
    saveFailed: 'Failed to save the token. Try again.',
  },

  pricePreview: {
    currentPrice: 'Current price',
    perKwh: '/ kWh',
    todayMin: 'Today min',
    todayMax: 'Today max',
    tomorrowPublished: 'Tomorrow published',
    tomorrowPending: 'Tomorrow pending',
  },

  touEditor: {
    labelPlaceholder: 'Label',
    periodName: 'Period {{n}}',
    addPeriod: 'Add period',
    overlap:
      '"{{a}}" overlaps "{{b}}" — the first matching period wins',
  },
};

export type SettingsNS = typeof settings;
