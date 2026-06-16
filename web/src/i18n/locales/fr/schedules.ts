import type { SchedulesNS } from '../en/schedules';

export const schedules: SchedulesNS = {
  title: 'Planifications',
  subtitle:
    'Exécutez des actions sur vos appareils à des heures précises : une fois, chaque jour ou certains jours',
  new: 'Nouvelle planification',
  create: 'Créer une planification',
  loading: 'Chargement des planifications...',
  stats: {
    total: 'Total',
    recurrent: 'Récurrentes',
    once: 'Une fois',
  },
  empty: {
    title: 'Aucune planification pour le moment',
    forHome: 'Aucune planification configurée pour « {{home}} »',
    cta: 'Planifiez des actions automatiques : éteindre les lumières à minuit, arroser les plantes lun/mer/ven, ...',
  },
  freq: {
    ONCE: 'Une fois',
    DAILY: 'Chaque jour',
    CUSTOM: 'Jours personnalisés',
  },
  card: {
    actions: 'actions',
    days_one: '{{count}} jour',
    days_other: '{{count}} jours',
    everyDay: 'Chaque jour',
    noDays: 'Aucun jour',
    updated: 'Mis à jour {{date}}',
    deleteTitle: 'Supprimer la planification',
    unknownHome: 'Inconnu',
  },
  form: {
    createTitle: 'Créer une planification',
    editTitle: 'Modifier la planification',
    update: 'Mettre à jour la planification',
    basicInfo: 'Informations de base',
    name: 'Nom *',
    namePlaceholder: 'Éteindre les lumières de la chambre la nuit',
    home: 'Maison *',
    selectHome: 'Sélectionner une maison',
    active: 'Active',
    whenToRun: 'Quand exécuter',
    dateTime: 'Date et heure *',
    timeAnchor: 'Heure de référence *',
    dateHint: 'La planification se déclenche une fois à ce moment précis.',
    timeHint:
      'Pour les planifications récurrentes, seule l’heure de la journée compte.',
    daysOfWeek: 'Jours de la semaine *',
    pickDay: 'Choisissez au moins un jour.',
    daysSelected_one: '{{count}} jour sélectionné.',
    daysSelected_other: '{{count}} jours sélectionnés.',
    actionsToRun: 'Actions à exécuter',
    notification: 'Notification',
    deviceAction: 'Action d’appareil',
    noActions:
      'Aucune action pour le moment. Ajoutez une action d’appareil ou une notification.',
    notificationChannels: 'Canaux de notification',
    channelsHint:
      'Choisissez où les notifications seront envoyées. Au moins un est requis lorsqu’il y a une action de notification.',
    messagePlaceholder: 'Message de notification...',
    device: 'Appareil',
    attribute: 'Attribut',
    value: 'Valeur',
    freqHint: {
      ONCE: 'Exécuter une seule fois à la date/heure',
      DAILY: 'Exécuter chaque jour à la même heure',
      CUSTOM: 'Exécuter les jours sélectionnés de la semaine',
    },
    toast: {
      nameRequired: 'Le nom est obligatoire',
      selectHome: 'Veuillez sélectionner une maison',
      dateRequired: 'La date/heure est obligatoire',
      pickDay: 'Choisissez au moins un jour pour les planifications personnalisées',
      addAction: 'Ajoutez au moins une action',
      channelRequired:
        'Les actions de notification nécessitent au moins un canal',
      updated: 'Planification mise à jour',
      created: 'Planification créée',
    },
  },
};
