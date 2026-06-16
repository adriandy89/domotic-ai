import type { DashboardNS } from '../en/dashboard';

export const dashboard: DashboardNS = {
  title: 'Panel',
  subtitle: 'Vista general de tu hogar inteligente',
  live: 'En vivo',
  cards: {
    totalHomes: 'Total de hogares',
    totalHomesSub: '{{online}} en línea, {{offline}} sin conexión',
    totalDevices: 'Total de dispositivos',
    totalDevicesSub: '{{count}} activos recientemente',
    connectionStatus: 'Estado de conexión',
    allOnline: 'Todos en línea',
    offlineCount: '{{count}} sin conexión',
    sseConnected: 'SSE conectado',
    sseDisconnected: 'SSE desconectado',
  },
  network: {
    title: 'Salud de la red',
    subtitle: 'Calidad de señal y conectividad',
    strong: 'Señales fuertes',
    allGoodLqi: 'Todos los dispositivos con buen LQI',
    weakSignal_one: '{{count}} dispositivo con posible señal débil',
    weakSignal_other: '{{count}} dispositivos con posible señal débil',
  },
  security: {
    title: 'Estado de seguridad',
    allSecure: 'Todas las zonas monitorizadas están seguras',
    attention: 'Atención requerida',
    systemSecure: 'Sistema seguro',
    open: 'Abierto',
    smoke: 'Humo',
    waterLeak: 'Fuga de agua',
  },
  climate: {
    title: 'Clima',
    avgTemp: 'Temp. media: {{temp}} °C',
    noData: 'Sin datos de temperatura',
    noSensors: 'No hay sensores de clima activos',
    room: 'Estancia',
    tempHumidity: 'Temp. / Humedad',
  },
  battery: {
    title: 'Avisos de batería baja',
  },
};
