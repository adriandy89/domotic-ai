export const applianceMonitors = {
  title: 'Appliance monitors',
  description:
    'Detect when an appliance (washing machine, dishwasher…) starts and finishes from the power draw of a metered smart plug, and get notified when it is done.',
  allHomes: 'All homes',
  new: 'New monitor',
  newTitle: 'New appliance monitor',
  editTitle: 'Edit appliance monitor',
  empty: 'No appliance monitors yet.',
  name: 'Name',
  namePlaceholder: 'e.g. Kitchen washing machine',
  home: 'Home',
  appliance: 'Appliance',
  sourcePlug: 'Source smart plug',
  selectPlug: 'Select a plug…',
  sourcePlugHint:
    'The metered plug the appliance is connected to (must report power).',
  runThreshold: 'Start threshold',
  idleThreshold: 'Idle threshold',
  minRun: 'Min run time',
  minFinish: 'Min idle time',
  runThresholdW: 'Start threshold (W)',
  idleThresholdW: 'Idle threshold (W)',
  minRunS: 'Min run time (s)',
  minFinishS: 'Min idle time (s)',
  active: 'Active',
  inactive: 'Inactive',
  type: {
    washing_machine: 'Washing machine',
    dishwasher: 'Dishwasher',
    dryer: 'Dryer',
    other: 'Other',
  },
};

export type ApplianceMonitorsNS = typeof applianceMonitors;
