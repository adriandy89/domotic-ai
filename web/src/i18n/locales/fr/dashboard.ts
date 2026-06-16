import type { DashboardNS } from '../en/dashboard';

export const dashboard: DashboardNS = {
  title: 'Tableau de bord',
  subtitle: 'Vue d’ensemble de votre maison connectée',
  live: 'En direct',
  cards: {
    totalHomes: 'Total des maisons',
    totalHomesSub: '{{online}} en ligne, {{offline}} hors ligne',
    totalDevices: 'Total des appareils',
    totalDevicesSub: '{{count}} actifs récemment',
    connectionStatus: 'État de la connexion',
    allOnline: 'Tous en ligne',
    offlineCount: '{{count}} hors ligne',
    sseConnected: 'SSE connecté',
    sseDisconnected: 'SSE déconnecté',
  },
  network: {
    title: 'Santé du réseau',
    subtitle: 'Qualité du signal et connectivité',
    strong: 'Signaux forts',
    allGoodLqi: 'Tous les appareils ont un bon LQI',
    weakSignal_one: '{{count}} appareil au signal potentiellement faible',
    weakSignal_other: '{{count}} appareils au signal potentiellement faible',
  },
  security: {
    title: 'État de sécurité',
    allSecure: 'Toutes les zones surveillées sont sécurisées',
    attention: 'Attention requise',
    systemSecure: 'Système sécurisé',
    open: 'Ouvert',
    smoke: 'Fumée',
    waterLeak: 'Fuite d’eau',
  },
  climate: {
    title: 'Climat',
    avgTemp: 'Temp. moyenne : {{temp}} °C',
    noData: 'Aucune donnée de température',
    noSensors: 'Aucun capteur climatique actif',
    room: 'Pièce',
    tempHumidity: 'Temp. / Humidité',
  },
  battery: {
    title: 'Alertes de batterie faible',
  },
};
