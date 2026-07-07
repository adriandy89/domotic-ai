import type { ApplianceMonitorsNS } from '../en/applianceMonitors';

export const applianceMonitors: ApplianceMonitorsNS = {
  title: 'Monitores de electrodomésticos',
  description:
    'Detecta cuándo un electrodoméstico (lavadora, lavavajillas…) empieza y termina a partir del consumo de un enchufe con medición, y recibe un aviso cuando acabe.',
  allHomes: 'Todos los hogares',
  new: 'Nuevo monitor',
  newTitle: 'Nuevo monitor de electrodoméstico',
  editTitle: 'Editar monitor de electrodoméstico',
  empty: 'Aún no hay monitores de electrodomésticos.',
  name: 'Nombre',
  namePlaceholder: 'p. ej. Lavadora de la cocina',
  home: 'Hogar',
  appliance: 'Electrodoméstico',
  sourcePlug: 'Enchufe medidor',
  selectPlug: 'Selecciona un enchufe…',
  sourcePlugHint:
    'El enchufe con medición al que está conectado el electrodoméstico (debe reportar potencia).',
  runThreshold: 'Umbral de inicio',
  idleThreshold: 'Umbral de reposo',
  minRun: 'Tiempo mín. en marcha',
  minFinish: 'Tiempo mín. en reposo',
  runThresholdW: 'Umbral de inicio (W)',
  idleThresholdW: 'Umbral de reposo (W)',
  minRunS: 'Tiempo mín. en marcha (s)',
  minFinishS: 'Tiempo mín. en reposo (s)',
  active: 'Activo',
  inactive: 'Inactivo',
  type: {
    washing_machine: 'Lavadora',
    dishwasher: 'Lavavajillas',
    dryer: 'Secadora',
    other: 'Otro',
  },
};
