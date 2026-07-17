import type { RulesNS } from '../en/rules';

export const rules: RulesNS = {
  title: 'Reglas',
  subtitle: 'Automatiza tu hogar inteligente con reglas condicionales',
  new: 'Nueva regla',
  create: 'Crear regla',
  loading: 'Cargando reglas...',
  stats: {
    total: 'Total de reglas',
    conditions: 'Total de condiciones',
  },
  empty: {
    title: 'No se encontraron reglas',
    forHome: 'No hay reglas configuradas para "{{home}}"',
    cta: 'Crea tu primera regla para automatizar tu hogar inteligente',
  },
  card: {
    conditions: 'condiciones',
    actions: 'acciones',
    deleteTitle: 'Eliminar regla',
    unknownHome: 'Desconocido',
    allDay: 'Todo el día',
  },
  form: {
    createTitle: 'Crear regla',
    editTitle: 'Editar regla',
    basicInfo: 'Información básica',
    name: 'Nombre *',
    namePlaceholder: 'Nombre de la regla',
    home: 'Hogar *',
    selectHome: 'Selecciona un hogar',
    description: 'Descripción',
    descriptionPlaceholder: 'Descripción opcional',
    type: 'Tipo',
    recurrent: 'Recurrente',
    once: 'Una vez',
    waitSeconds: 'Esperar condiciones verdaderas',
    active: 'Activa',
    conditions: 'Condiciones',
    add: 'Añadir',
    noConditions: 'No se añadieron condiciones. Pulsa "Añadir" para crear una.',
    results: 'Resultados / Acciones',
    noResults: 'No se añadieron resultados. Pulsa "Añadir" para crear uno.',
    device: 'Dispositivo',
    attribute: 'Atributo',
    value: 'Valor',
    attributeRequiredHint:
      'Selecciona el atributo de movimiento/presencia a vigilar (p. ej. occupancy).',
    selectCommand: 'Selecciona un comando',
    noLearnedCommands: 'No hay comandos aprendidos',
    eventMessage: 'Mensaje del evento',
    allMatch: 'Todas',
    anyMatch: 'Cualquiera',
    trigger: 'Disparador',
    triggerHint:
      'Activado: los datos de esta condición inician la evaluación de la regla. Desactivado: la condición solo se comprueba con su último estado conocido.',
    runOffline: 'Ejecutar sin conexión',
    runOfflineHint:
      'Mantén esta regla funcionando sin internet en hogares con edge (solo acciones COMMAND).',
    update: 'Actualizar regla',
    resultType: {
      COMMAND: 'Enviar acción',
      NOTIFICATION: 'Solo notificación',
    },
    op: {
      EQ: 'Igual',
      NEQ: 'Distinto',
      GT: 'Mayor que',
      LT: 'Menor que',
      GTE: 'Mayor o igual',
      LTE: 'Menor o igual',
      CONTAINS: 'Contiene',
      INACTIVE: 'Inactivo durante',
      STALE: 'Sin reportar durante',
    },
    unit: {
      seconds: 'segundos',
      minutes: 'minutos',
      hours: 'horas',
      days: 'días',
    },
    window: {
      title: 'Cuándo ejecutar',
      subtitle:
        'Limita los días y la franja horaria en los que esta regla puede actuar (hora del hogar).',
      enable: 'Limitar cuándo se ejecuta',
      days: 'Días',
      everyDay: 'Sin días seleccionados: se aplica todos los días.',
      daysHint: 'La regla solo actúa en los días seleccionados.',
      allDay: 'Todo el día',
      from: 'Desde',
      to: 'Hasta',
      overnightHint:
        'Si la hora de inicio es posterior a la de fin, la franja cruza la medianoche (p. ej. 22:00–06:00).',
    },
    toast: {
      nameRequired: 'El nombre es obligatorio',
      selectHome: 'Selecciona un hogar',
      conditionRequired: 'Se requiere al menos una condición',
      attributeRequired:
        'Elige el atributo a vigilar para la condición "Inactivo durante".',
      resultRequired: 'Se requiere al menos un resultado',
      triggerRequired:
        'Al menos una condición debe tener el disparador activado',
      updated: 'Regla actualizada correctamente',
      created: 'Regla creada correctamente',
    },
  },
  templates: {
    title: 'Empezar desde una plantilla',
    subtitle: 'Plantillas de cuidado para monitorizar a personas que viven solas',
    blank: 'Empezar en blanco',
    noMotion: {
      label: 'Sin movimiento',
      name: 'Aviso de sin movimiento',
      desc: 'Avisar si un sensor de movimiento/presencia no detecta a nadie durante un tiempo',
      event: 'No se ha detectado movimiento durante el tiempo configurado.',
    },
    silent: {
      label: 'Dispositivo en silencio',
      name: 'Dispositivo no reporta',
      desc: 'Avisar si un dispositivo deja de enviar datos',
      event: 'Un dispositivo ha dejado de reportar durante el tiempo configurado.',
    },
    lowBattery: {
      label: 'Batería baja',
      name: 'Aviso de batería baja',
      desc: 'Avisar cuando la batería de un dispositivo baje de un umbral',
      event: 'La batería de un dispositivo se está agotando.',
    },
    routine: {
      label: 'Rutina diaria',
      name: 'Comprobación de rutina diaria',
      desc: 'Avisar si no ocurre una actividad diaria esperada',
      event: 'No se ha detectado una actividad diaria esperada.',
    },
  },
  care: {
    title: 'Opciones de cuidado',
    subtitle: 'Configura a quién se avisa y comprobaciones opcionales del dispositivo',
    badge: 'Cuidado',
    filter: 'Cuidado',
    recipient: 'Avisar por email (externo)',
    recipientPlaceholder: 'familiar@email.com, otro@email.com',
    recipientHint:
      'Déjalo vacío para avisarte a ti por tus canales activos. Separa varios emails con comas.',
    addonLowBattery:
      'Avisar también si la batería de este dispositivo está baja (< 20%)',
    addonSilent:
      'Avisar también si este dispositivo deja de reportar (> 1 día)',
  },
  help: {
    open: 'Guía de reglas',
    title: 'Guía de reglas',
    close: 'Cerrar guía',
    intro:
      'Una regla vigila tus dispositivos y actúa sola. Lee esta guía junto al formulario: cada sección de abajo corresponde a una tarjeta de la izquierda.',
    exampleLabel: 'Ejemplo',
    flow: {
      data: 'Un dispositivo reporta',
      conditions: 'Las condiciones se cumplen',
      actions: 'Se ejecutan las acciones',
    },
    overview: {
      title: '¿Qué es una regla?',
      p1: 'Una regla es una automatización: CUANDO tus dispositivos reportan datos que cumplen todas las condiciones que definas, ENTONCES se ejecutan las acciones. No tienes que pulsar nada.',
      p2: 'Cada vez que un dispositivo de tu hogar reporta (una pulsación, una lectura de temperatura, una puerta que se abre), la regla comprueba sus condiciones con el último estado conocido de cada dispositivo implicado.',
      example:
        'Cuando se pulsa el botón → enciende la luz del cuarto. Una condición, una acción.',
    },
    basic: {
      title: 'Información básica',
      typeName: 'Tipo',
      typeDesc:
        'Las reglas recurrentes se ejecutan cada vez que se cumplen sus condiciones. Las de una sola vez se ejecutan una vez y se desactivan solas.',
      waitName: 'Esperar condiciones verdaderas',
      waitDesc:
        'Las condiciones deben mantenerse ciertas durante este tiempo antes de ejecutar las acciones. Si dejan de cumplirse durante la espera, se cancela. 0 = ejecutar al momento.',
      waitExample:
        'Deja de haber movimiento + esperar 10 minutos → la luz solo se apaga tras 10 minutos sin movimiento.',
      activeName: 'Activa',
      activeDesc: 'Enciende o apaga la regla entera sin borrarla.',
      allName: 'Todas / Cualquiera',
      allDesc:
        '"Todas" exige que todas las condiciones sean ciertas a la vez (Y). "Cualquiera" ejecuta la regla en cuanto se cumple una sola (O).',
      offlineName: 'Ejecutar sin conexión',
      offlineDesc:
        'Mantiene la regla funcionando en tu hogar incluso sin internet (hogares con edge, solo acciones sobre dispositivos).',
    },
    conditions: {
      title: 'Condiciones',
      p1: 'Cada fila compara un atributo de un dispositivo con un valor: elige el dispositivo, el atributo a vigilar (p. ej. temperatura), cómo comparar (=, >, <…) y el valor.',
      absenceName: '"Inactivo durante" / "Sin reportar durante"',
      absenceDesc:
        'Las condiciones de ausencia saltan cuando algo NO ocurre: sin movimiento durante 8 horas, o un sensor callado un día. Útiles para cuidado y comprobaciones.',
      triggerName: 'Interruptor Disparador (modo Todas)',
      triggerDesc:
        'Con "Todas" activo, cada condición muestra un interruptor Disparador. Activado: los datos nuevos de esta condición inician la comprobación de la regla. Desactivado: la condición sigue contando, pero solo con su último valor conocido — sus propios datos nunca inician la comprobación.',
      triggerExample:
        'La puerta se abre (disparador ON) + luminosidad > 100 (disparador OFF) → la regla se ejecuta solo en el momento en que se abre la puerta, si hay luz suficiente. Los cambios de luminosidad por sí solos nunca la ejecutan.',
    },
    window: {
      title: 'Cuándo ejecutar',
      p1: 'Limita los días y la franja horaria en los que la regla puede actuar, en la hora de tu hogar. Fuera de la franja la regla sigue armada pero en silencio.',
      example:
        'De 22:00 a 06:00 cruza la medianoche: la regla puede actuar a las 23:30 y a las 05:00, pero no a mediodía.',
    },
    results: {
      title: 'Resultados / Acciones',
      commandName: 'Enviar acción',
      commandDesc:
        'Controla un dispositivo: enciende una luz, conmuta un enchufe, fija un estado. Elige el dispositivo, el atributo y el valor a establecer.',
      notificationName: 'Notificación',
      notificationDesc:
        'Te envía un mensaje por tus canales activos (email, Telegram). Las reglas de cuidado también pueden avisar a personas externas por email.',
    },
    example: {
      title: 'Ejemplo completo',
      step1: 'Nombra la regla "El botón enciende la luz" y elige tu hogar.',
      step2:
        'Añade una condición: dispositivo "Button Switch", atributo "action", = Igual, valor "single".',
      step3:
        'Añade un resultado: Enviar acción → dispositivo "Bombilla LED", atributo "state", valor "ON".',
      step4: 'Deja "Activa" encendida y guarda. Pulsa el botón para probarla.',
      tipLabel: 'Consejo',
      tip: 'Empieza simple — una condición, una acción — y añade condiciones cuando funcione.',
    },
  },
};
