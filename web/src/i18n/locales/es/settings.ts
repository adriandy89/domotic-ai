import type { SettingsNS } from '../en/settings';

export const settings: SettingsNS = {
  title: 'Ajustes',
  subtitle: 'Gestiona tu perfil y tus preferencias',
  tabs: {
    general: 'General',
    notifications: 'Notificaciones',
    integrations: 'Integraciones',
    energy: 'Energía',
  },
  language: {
    title: 'Idioma',
    description: 'Idioma utilizado para la interfaz y todas tus notificaciones.',
    label: 'Idioma',
    updated: 'Idioma actualizado',
    error: 'No se pudo actualizar el idioma',
  },

  sessions: {
    title: 'Sesiones activas',
    description_one: 'Tienes {{count}} sesión activa en otro navegador.',
    description_other: 'Tienes {{count}} sesiones activas en otros navegadores.',
    logout: 'Cerrar sesión en el otro navegador',
    confirmTitle: '¿Estás activo en otro navegador?',
    confirmDesc:
      'Esta acción cerrará la sesión de todos los demás navegadores conectados a tu cuenta. Seguirás conectado en este navegador.',
    loggingOut: 'Cerrando sesión...',
    logoutOthers: 'Cerrar las demás',
  },

  notifications: {
    title: 'Notificaciones',
    description:
      'Configura qué eventos globales de sensores generan notificaciones.',
    updateError: 'Error al actualizar los atributos del usuario',
    attributes: {
      contactTrue: 'Sensor de contacto (cerrado)',
      contactFalse: 'Sensor de contacto (abierto)',
      vibrationTrue: 'Vibración detectada',
      occupancyTrue: 'Ocupación detectada',
      presenceTrue: 'Presencia detectada',
      smokeTrue: 'Humo detectado',
      waterLeakTrue: 'Fuga de agua detectada',
    },
  },

  mcp: {
    title: 'Endpoint MCP',
    description:
      'Conecta Claude Desktop, Cursor o cualquier cliente compatible con MCP a tu hogar inteligente con un token personal.',
    endpointUrl: 'URL del endpoint',
    copyEndpoint: 'Copiar URL del endpoint',
    copied: 'Copiado.',
    personalTokens: 'Tokens personales',
    tokensHint:
      'Cada token autentica a un cliente. Revoca cualquier token para desconectar ese cliente de inmediato.',
    newToken: 'Nuevo token',
    noTokens: 'No tienes tokens MCP activos.',
    createFirst: 'Crea tu primer token',
    lastUsed: 'Último uso: {{date}}',
    created: 'Creado: {{date}}',
    revoke: 'Revocar',
    setupInstructions: 'Instrucciones de configuración',
    setupUrlOnly:
      '<b>Clientes solo-URL</b> (conector personalizado de Claude.ai, n8n, webhooks de agentes): pega esta URL — el token viaja como parámetro de consulta.',
    setupUrlOnlyNote:
      'El token acaba en los registros del servidor y el historial del navegador. Para Claude Desktop / Cursor, mejor usa la cabecera Bearer de abajo.',
    setupDesktop: '<b>Claude Desktop / Cursor</b> vía <code>mcp-remote</code>:',
    setupInspector:
      '<b>MCP Inspector</b>: elige <em>Streamable HTTP</em>, apúntalo a <code>{{url}}</code> y define la cabecera <code>Authorization: Bearer …</code> o añade <code>?token=…</code> a la URL.',
    createTitle: 'Crear token MCP',
    createDesc: 'Dale al token un nombre reconocible (el cliente al que pertenece).',
    namePlaceholder: 'p. ej. Claude Desktop',
    tokenCreated: 'Token creado',
    tokenCreatedDesc:
      'Copia y guarda este token ahora. No volveremos a mostrarlo — solo podrás revocarlo y crear uno nuevo.',
    tokenLabel: 'Token',
    showToken: 'Mostrar token',
    hideToken: 'Ocultar token',
    copyToken: 'Copiar token',
    urlWithToken: 'URL con token (para clientes solo-URL)',
    copyUrl: 'Copiar URL',
    urlPasteHint:
      'Pega esto directamente en los conectores personalizados de Claude.ai, n8n o cualquier cliente que solo acepte una URL.',
    treatLikePassword:
      'Trata este token como una contraseña. Cualquiera que lo tenga puede actuar sobre tu hogar inteligente.',
    savedIt: 'Lo he guardado',
    revokeTitle: 'Revocar token',
    revokeDesc:
      'El cliente que usa <b>{{name}}</b> se desconectará en su próxima petición. Esto no se puede deshacer.',
    loadError: 'No se pudieron cargar los tokens MCP',
    createError: 'No se pudo crear el token',
    revokeError: 'No se pudo revocar el token',
  },

  xiaozhi: {
    title: 'Integración con Xiaozhi.me',
    description:
      'Permite que tu cuenta de xiaozhi.me controle este hogar inteligente con las mismas herramientas seguras.',
    state: {
      idle: 'Inactivo',
      connecting: 'Conectando…',
      connected: 'Conectado',
      error: 'Error',
    },
    outboundNote:
      'Cada integración es un WebSocket saliente desde este servidor hacia xiaozhi.me.',
    newIntegration: 'Nueva integración',
    noIntegrations: 'Aún no hay integraciones de Xiaozhi.',
    addFirst: 'Añade tu primera integración',
    disabledSuffix: '(deshabilitada)',
    connectedAt: 'Conectado: {{date}}',
    createdAt: 'Creado: {{date}}',
    reconnect: 'Reconectar / Probar',
    setupInstructions: 'Instrucciones de configuración',
    setupStep1:
      '1. En tu cuenta de Xiaozhi.me, genera una URL de endpoint MCP — tiene este aspecto: <code>wss://api.xiaozhi.me/mcp/?token=…</code>.',
    setupStep2:
      '2. Pégala en "+ Nueva integración" de arriba. El token se cifra en reposo antes de guardarse.',
    setupStep3:
      '3. Una vez habilitada, este servidor abre un WebSocket persistente hacia xiaozhi y expone las 19 herramientas del hogar (dispositivos, sensores, programaciones, reglas, mando IR, clima). El LLM de Xiaozhi puede invocarlas en tu nombre.',
    setupSafety:
      'Seguridad: las herramientas incluyen acciones destructivas (eliminar programación/regla, enviar comandos). Xiaozhi puede invocarlas sin confirmación por acción. Deshabilita o elimina la integración para revocar el acceso.',
    createTitle: 'Añadir integración de Xiaozhi',
    createDesc:
      'Dale un nombre a la integración y pega tu endpoint MCP de xiaozhi.me.',
    namePlaceholder: 'p. ej. Xiaozhi del salón',
    endpointUrl: 'URL del endpoint',
    showEndpoint: 'Mostrar endpoint',
    hideEndpoint: 'Ocultar endpoint',
    deleteTitle: 'Eliminar integración',
    deleteDesc:
      '"{{name}}" se desconectará y se eliminará. Esto no se puede deshacer.',
    nameRequired: 'El nombre es obligatorio',
    endpointInvalid: 'El endpoint debe ser wss://api.xiaozhi.me/mcp/?token=…',
    loadError: 'No se pudieron cargar las integraciones de Xiaozhi',
    createError: 'No se pudo crear la integración',
    updateError: 'No se pudo actualizar la integración',
    testError: 'No se pudo probar la integración',
    deleteError: 'No se pudo eliminar la integración',
  },

  ai: {
    title: 'Configuración de IA',
    description: 'Configura el proveedor de IA para tu organización.',
    notSet: 'Sin configurar',
    noConfig: 'No se encontró configuración de IA',
    configure: 'Configurar IA',
    dialogDesc:
      'Elige un proveedor y un modelo. Cada organización aporta su propia clave de API.',
    provider: 'Proveedor',
    selectProvider: 'Selecciona un proveedor',
    model: 'Modelo',
    apiKey: 'Clave de API',
    getKey: 'Obtener una clave',
    showKey: 'Mostrar clave',
    hideKey: 'Ocultar clave',
    currentKeyPlaceholder: 'Actual: {{key}} (déjalo vacío para mantenerla)',
    temperature: 'Temperatura ({{value}})',
    maxTokens: 'Máximo de tokens de salida',
    enableAi: 'Habilitar asistente de IA',
    enableAiHint:
      'Deshabilitarlo detiene el asistente de chat para toda la organización.',
    saveConfig: 'Guardar configuración',
    modelRequired: 'El modelo es obligatorio.',
    openrouterPrefix:
      'El modelo de OpenRouter debe incluir el prefijo del proveedor, p. ej. "anthropic/claude-haiku-4.5".',
    apiKeyRequired: 'La clave de API es obligatoria.',
    temperatureRange: 'La temperatura debe estar entre 0 y 2.',
    updateFailed: 'No se pudo actualizar la configuración de IA.',
  },

  tariff: {
    title: 'Tarifa eléctrica',
    description:
      'Cómo se valora el consumo de energía en los informes y el correo mensual.',
    pickHome: 'Elige un hogar…',
    modes: {
      fixedLabel: 'Precio fijo',
      fixedHint: 'Un único precio €/kWh para todas las horas',
      touLabel: 'Por tramos horarios',
      touHint: 'Periodos manuales (p. ej. 2.0TD español P1/P2/P3)',
      dynamicLabel: 'Dinámica (mercado)',
      dynamicHint: 'Precios horarios de una API pública (PVPC, ENTSO-E…)',
    },
    pricePerKwh: 'Precio por kWh',
    currency: 'Moneda',
    timezone: 'Zona horaria',
    defaultPrice: 'Precio por defecto (sin tramo coincidente)',
    loadPreset: 'Cargar preset 2.0TD español',
    provider: 'Proveedor',
    pickProvider: 'Elige un proveedor…',
    notConfigured: 'Sin configurar',
    zone: 'Zona',
    pickZone: 'Elige una zona…',
    fallbackPrice: 'Precio de respaldo por kWh',
    providersNeedToken:
      'Algunos proveedores necesitan un token de API antes de poder seleccionarse.',
    configureProvidersBelow: 'Configura los proveedores abajo',
    providersNeedTokenUser:
      'Los proveedores en gris necesitan un token de API — pide a un administrador que los configure en Ajustes → Energía.',
    marketHint:
      'Precios horarios de mercado (término de energía, impuestos excluidos). Las horas sin datos publicados usan el precio fijo de arriba y se marcan como estimaciones.',
    save: 'Guardar tarifa',
    onlyManagers: 'Solo los gestores pueden cambiar la configuración de la tarifa.',
    errorNoPeriods: 'Añade al menos un periodo (o carga el preset 2.0TD).',
    errorPickProviderZone: 'Elige un proveedor y una zona.',
    errorSaveFailed: 'No se pudo guardar la tarifa',
  },

  providers: {
    title: 'Proveedores de precios de mercado',
    description:
      'Tokens de API usados para obtener precios horarios de mercado (PVPC, ENTSO-E…) para tarifas dinámicas.',
    noProviders: 'No hay proveedores disponibles',
    configured: 'Configurado',
    notConfigured: 'Sin configurar',
    onlyAdmins: 'Solo los administradores pueden gestionar los tokens de proveedores.',
  },

  providerRow: {
    rejected: 'Token rechazado',
    rejectedNote:
      'El proveedor rechazó el token guardado. Guarda uno nuevo para volver a habilitarlo.',
    activeToken: 'Token activo',
    fromEnv: ' · desde variable de entorno',
    apiToken: 'Token de API',
    currentTokenPlaceholder: 'Actual: {{token}} (introduce uno nuevo para reemplazarlo)',
    pasteToken: 'Pega el token…',
    showToken: 'Mostrar token',
    hideToken: 'Ocultar token',
    saveToken: 'Guardar token',
    saveFailed: 'No se pudo guardar el token. Inténtalo de nuevo.',
  },

  pricePreview: {
    currentPrice: 'Precio actual',
    perKwh: '/ kWh',
    todayMin: 'Mín. hoy',
    todayMax: 'Máx. hoy',
    tomorrowPublished: 'Mañana publicado',
    tomorrowPending: 'Mañana pendiente',
  },

  touEditor: {
    labelPlaceholder: 'Etiqueta',
    periodName: 'Periodo {{n}}',
    addPeriod: 'Añadir periodo',
    overlap: '"{{a}}" se solapa con "{{b}}" — gana el primer periodo coincidente',
  },
};
