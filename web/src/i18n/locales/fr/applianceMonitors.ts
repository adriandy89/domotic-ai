import type { ApplianceMonitorsNS } from '../en/applianceMonitors';

export const applianceMonitors: ApplianceMonitorsNS = {
  title: 'Moniteurs d’appareils',
  description:
    'Détectez quand un appareil (lave-linge, lave-vaisselle…) démarre et se termine à partir de la consommation d’une prise connectée avec mesure, et soyez notifié une fois terminé.',
  allHomes: 'Tous les foyers',
  new: 'Nouveau moniteur',
  newTitle: 'Nouveau moniteur d’appareil',
  editTitle: 'Modifier le moniteur d’appareil',
  empty: 'Aucun moniteur d’appareil pour le moment.',
  name: 'Nom',
  namePlaceholder: 'p. ex. Lave-linge de la cuisine',
  home: 'Foyer',
  appliance: 'Appareil',
  sourcePlug: 'Prise avec mesure',
  selectPlug: 'Choisir une prise…',
  sourcePlugHint:
    'La prise avec mesure à laquelle l’appareil est branché (doit reporter la puissance).',
  runThreshold: 'Seuil de démarrage',
  idleThreshold: 'Seuil de repos',
  minRun: 'Durée min. en marche',
  minFinish: 'Durée min. au repos',
  runThresholdW: 'Seuil de démarrage (W)',
  idleThresholdW: 'Seuil de repos (W)',
  minRunS: 'Durée min. en marche (s)',
  minFinishS: 'Durée min. au repos (s)',
  active: 'Actif',
  inactive: 'Inactif',
  type: {
    washing_machine: 'Lave-linge',
    dishwasher: 'Lave-vaisselle',
    dryer: 'Sèche-linge',
    other: 'Autre',
  },
};
