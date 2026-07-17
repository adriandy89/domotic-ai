import type { RulesNS } from '../en/rules';

export const rules: RulesNS = {
  title: 'Règles',
  subtitle: 'Automatisez votre maison connectée avec des règles conditionnelles',
  new: 'Nouvelle règle',
  create: 'Créer une règle',
  loading: 'Chargement des règles...',
  stats: {
    total: 'Total des règles',
    conditions: 'Total des conditions',
  },
  empty: {
    title: 'Aucune règle trouvée',
    forHome: 'Aucune règle configurée pour « {{home}} »',
    cta: 'Créez votre première règle pour automatiser votre maison connectée',
  },
  card: {
    conditions: 'conditions',
    actions: 'actions',
    deleteTitle: 'Supprimer la règle',
    unknownHome: 'Inconnu',
    allDay: 'Toute la journée',
  },
  form: {
    createTitle: 'Créer une règle',
    editTitle: 'Modifier la règle',
    basicInfo: 'Informations de base',
    name: 'Nom *',
    namePlaceholder: 'Nom de la règle',
    home: 'Maison *',
    selectHome: 'Sélectionner une maison',
    description: 'Description',
    descriptionPlaceholder: 'Description facultative',
    type: 'Type',
    recurrent: 'Récurrente',
    once: 'Une fois',
    waitSeconds: 'Attendre conditions vraies',
    active: 'Active',
    conditions: 'Conditions',
    add: 'Ajouter',
    noConditions: 'Aucune condition ajoutée. Cliquez sur « Ajouter » pour en créer une.',
    results: 'Résultats / Actions',
    noResults: 'Aucun résultat ajouté. Cliquez sur « Ajouter » pour en créer un.',
    device: 'Appareil',
    attribute: 'Attribut',
    value: 'Valeur',
    attributeRequiredHint:
      'Sélectionnez l’attribut de mouvement/présence à surveiller (p. ex. occupancy).',
    selectCommand: 'Sélectionner une commande',
    noLearnedCommands: 'Aucune commande apprise',
    eventMessage: 'Message de l’événement',
    allMatch: 'Toutes',
    anyMatch: 'N’importe laquelle',
    trigger: 'Déclencheur',
    triggerHint:
      'Activé : les données de cette condition lancent l’évaluation de la règle. Désactivé : la condition n’est vérifiée qu’avec son dernier état connu.',
    runOffline: 'Exécuter hors ligne',
    runOfflineHint:
      'Garde cette règle active sans internet sur les maisons edge (actions COMMAND uniquement).',
    update: 'Mettre à jour la règle',
    resultType: {
      COMMAND: 'Envoyer une action',
      NOTIFICATION: 'Notification seulement',
    },
    op: {
      EQ: 'Égal',
      NEQ: 'Différent',
      GT: 'Supérieur à',
      LT: 'Inférieur à',
      GTE: 'Supérieur ou égal',
      LTE: 'Inférieur ou égal',
      CONTAINS: 'Contient',
      INACTIVE: 'Inactif pendant',
      STALE: 'Sans rapport pendant',
    },
    unit: {
      seconds: 'secondes',
      minutes: 'minutes',
      hours: 'heures',
      days: 'jours',
    },
    window: {
      title: 'Quand exécuter',
      subtitle:
        'Limitez les jours et la plage horaire où cette règle peut agir (fuseau du domicile).',
      enable: 'Limiter quand elle s’exécute',
      days: 'Jours',
      everyDay: 'Aucun jour sélectionné : s’applique tous les jours.',
      daysHint: 'La règle n’agit que les jours sélectionnés.',
      allDay: 'Toute la journée',
      from: 'De',
      to: 'À',
      overnightHint:
        'Si l’heure de début est postérieure à l’heure de fin, la plage traverse minuit (p. ex. 22:00–06:00).',
    },
    toast: {
      nameRequired: 'Le nom est obligatoire',
      selectHome: 'Veuillez sélectionner une maison',
      conditionRequired: 'Au moins une condition est requise',
      attributeRequired:
        'Choisissez l’attribut à surveiller pour la condition « Inactif pendant ».',
      resultRequired: 'Au moins un résultat est requis',
      triggerRequired:
        'Au moins une condition doit avoir le déclencheur activé',
      updated: 'Règle mise à jour avec succès',
      created: 'Règle créée avec succès',
    },
  },
  templates: {
    title: 'Partir d’un modèle',
    subtitle: 'Modèles de soins pour surveiller les personnes vivant seules',
    blank: 'Partir de zéro',
    noMotion: {
      label: 'Aucun mouvement',
      name: 'Alerte aucun mouvement',
      desc: 'Alerter si un capteur de mouvement/présence ne détecte personne pendant un certain temps',
      event: 'Aucun mouvement n’a été détecté pendant la durée configurée.',
    },
    silent: {
      label: 'Appareil silencieux',
      name: 'Appareil ne rapporte plus',
      desc: 'Alerter si un appareil cesse d’envoyer des données',
      event: 'Un appareil a cessé de rapporter pendant la durée configurée.',
    },
    lowBattery: {
      label: 'Batterie faible',
      name: 'Alerte batterie faible',
      desc: 'Alerter quand la batterie d’un appareil passe sous un seuil',
      event: 'La batterie d’un appareil est faible.',
    },
    routine: {
      label: 'Routine quotidienne',
      name: 'Vérification de routine quotidienne',
      desc: 'Alerter si une activité quotidienne attendue n’a pas eu lieu',
      event: 'Une activité quotidienne attendue n’a pas été détectée.',
    },
  },
  care: {
    title: 'Options de soins',
    subtitle:
      'Configurez qui est notifié et les vérifications facultatives de l’appareil',
    badge: 'Soins',
    filter: 'Soins',
    recipient: 'Notifier par e-mail (externe)',
    recipientPlaceholder: 'proche@email.com, autre@email.com',
    recipientHint:
      'Laissez vide pour vous notifier via vos canaux activés. Séparez plusieurs e-mails par des virgules.',
    addonLowBattery:
      'M’alerter aussi si la batterie de cet appareil est faible (< 20%)',
    addonSilent:
      'M’alerter aussi si cet appareil cesse de rapporter (> 1 jour)',
  },
  help: {
    open: 'Guide des règles',
    title: 'Guide des règles',
    close: 'Fermer le guide',
    intro:
      'Une règle surveille vos appareils et agit toute seule. Lisez ce guide à côté du formulaire : chaque section ci-dessous correspond à une carte à gauche.',
    exampleLabel: 'Exemple',
    flow: {
      data: 'Un appareil rapporte',
      conditions: 'Les conditions sont remplies',
      actions: 'Les actions s’exécutent',
    },
    overview: {
      title: 'Qu’est-ce qu’une règle ?',
      p1: 'Une règle est une automatisation : QUAND vos appareils rapportent des données qui remplissent toutes les conditions définies, ALORS les actions s’exécutent. Vous n’avez rien à presser.',
      p2: 'Chaque fois qu’un appareil de votre domicile rapporte (un appui de bouton, une température, une porte qui s’ouvre), la règle vérifie ses conditions avec le dernier état connu de chaque appareil concerné.',
      example:
        'Quand le bouton est pressé → allumer la lumière de la chambre. Une condition, une action.',
    },
    basic: {
      title: 'Informations de base',
      typeName: 'Type',
      typeDesc:
        'Les règles récurrentes s’exécutent chaque fois que leurs conditions sont remplies. Les règles à usage unique s’exécutent une fois puis se désactivent.',
      waitName: 'Attendre que les conditions restent vraies',
      waitDesc:
        'Les conditions doivent rester vraies pendant cette durée avant d’exécuter les actions. Si elles cessent d’être vraies pendant l’attente, l’exécution est annulée. 0 = exécuter immédiatement.',
      waitExample:
        'Plus de mouvement + attendre 10 minutes → la lumière ne s’éteint qu’après 10 minutes sans mouvement.',
      activeName: 'Active',
      activeDesc: 'Active ou désactive toute la règle sans la supprimer.',
      allName: 'Toutes / N’importe laquelle',
      allDesc:
        '« Toutes » exige que toutes les conditions soient vraies en même temps (ET). « N’importe laquelle » exécute la règle dès qu’une seule est remplie (OU).',
      offlineName: 'Exécuter hors ligne',
      offlineDesc:
        'Garde la règle fonctionnelle chez vous même sans internet (domiciles edge, actions sur appareils uniquement).',
    },
    conditions: {
      title: 'Conditions',
      p1: 'Chaque ligne compare un attribut d’appareil à une valeur : choisissez l’appareil, l’attribut à surveiller (p. ex. température), la comparaison (=, >, <…) et la valeur.',
      absenceName: '« Inactif pendant » / « Sans rapport pendant »',
      absenceDesc:
        'Les conditions d’absence se déclenchent quand quelque chose n’arrive PAS : aucun mouvement pendant 8 heures, ou un capteur muet pendant un jour. Utiles pour les soins et les vérifications.',
      triggerName: 'Interrupteur Déclencheur (mode Toutes)',
      triggerDesc:
        'Avec « Toutes » activé, chaque condition affiche un interrupteur Déclencheur. Activé : les nouvelles données de cette condition lancent la vérification de la règle. Désactivé : la condition compte toujours, mais seulement avec sa dernière valeur connue — ses propres données ne lancent jamais la vérification.',
      triggerExample:
        'La porte s’ouvre (déclencheur ON) + luminosité > 100 (déclencheur OFF) → la règle ne s’exécute qu’au moment où la porte s’ouvre, s’il y a assez de lumière. Les changements de luminosité seuls ne l’exécutent jamais.',
    },
    window: {
      title: 'Quand exécuter',
      p1: 'Limite les jours et la plage horaire pendant lesquels la règle peut agir, à l’heure de votre domicile. Hors de la plage, la règle reste armée mais silencieuse.',
      example:
        'De 22h00 à 06h00 traverse minuit : la règle peut agir à 23h30 et à 05h00, mais pas à midi.',
    },
    results: {
      title: 'Résultats / Actions',
      commandName: 'Envoyer une action',
      commandDesc:
        'Contrôle un appareil : allumer une lumière, commuter une prise, fixer un état. Choisissez l’appareil, l’attribut et la valeur à définir.',
      notificationName: 'Notification',
      notificationDesc:
        'Vous envoie un message via vos canaux activés (e-mail, Telegram). Les règles de soins peuvent aussi notifier des personnes externes par e-mail.',
    },
    example: {
      title: 'Exemple complet',
      step1: 'Nommez la règle « Le bouton allume la lumière » et choisissez votre domicile.',
      step2:
        'Ajoutez une condition : appareil « Button Switch », attribut « action », = Égal, valeur « single ».',
      step3:
        'Ajoutez un résultat : Envoyer une action → appareil « Ampoule LED », attribut « state », valeur « ON ».',
      step4: 'Laissez « Active » allumée et enregistrez. Appuyez sur le bouton pour tester.',
      tipLabel: 'Astuce',
      tip: 'Commencez simple — une condition, une action — et ajoutez des conditions quand ça fonctionne.',
    },
  },
};
