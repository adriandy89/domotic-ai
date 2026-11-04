export const rules = {
  title: 'Rules',
  subtitle: 'Automate your smart home with conditional rules',
  new: 'New Rule',
  create: 'Create Rule',
  loading: 'Loading rules...',
  stats: {
    total: 'Total Rules',
    conditions: 'Total Conditions',
  },
  empty: {
    title: 'No rules found',
    forHome: 'No rules configured for "{{home}}"',
    cta: 'Create your first rule to automate your smart home',
  },
  card: {
    conditions: 'conditions',
    actions: 'actions',
    deleteTitle: 'Delete Rule',
    unknownHome: 'Unknown',
    allDay: 'All day',
  },
  form: {
    createTitle: 'Create Rule',
    editTitle: 'Edit Rule',
    basicInfo: 'Basic Information',
    name: 'Name *',
    namePlaceholder: 'Rule name',
    home: 'Home *',
    selectHome: 'Select home',
    description: 'Description',
    descriptionPlaceholder: 'Optional description',
    type: 'Type',
    recurrent: 'Recurrent',
    once: 'One Time',
    waitSeconds: 'Wait Conditions True',
    active: 'Active',
    conditions: 'Conditions',
    add: 'Add',
    noConditions: 'No conditions added. Click "Add" to create one.',
    results: 'Results / Actions',
    noResults: 'No results added. Click "Add" to create one.',
    device: 'Device',
    attribute: 'Attribute',
    value: 'Value',
    attributeRequiredHint:
      'Select the motion/presence attribute to watch (e.g. occupancy).',
    selectCommand: 'Select command',
    noLearnedCommands: 'No learned commands',
    eventMessage: 'Event message',
    allMatch: 'All match',
    anyMatch: 'Any match',
    trigger: 'Trigger',
    triggerHint:
      'On: data from this condition starts rule evaluation. Off: the condition is only checked against its last known state.',
    runOffline: 'Run offline',
    runOfflineHint:
      'Keep this rule working without internet on edge-enabled homes (COMMAND actions only).',
    update: 'Update Rule',
    resultType: {
      COMMAND: 'Send Action',
      NOTIFICATION: 'Notification Only',
    },
    op: {
      EQ: 'Equal',
      NEQ: 'Not Equal',
      GT: 'Greater Than',
      LT: 'Less Than',
      GTE: 'Greater or Equal',
      LTE: 'Less or Equal',
      CONTAINS: 'Contains',
      INACTIVE: 'Inactive for',
      STALE: 'No report for',
    },
    unit: {
      seconds: 'seconds',
      minutes: 'minutes',
      hours: 'hours',
      days: 'days',
    },
    window: {
      title: 'When to run',
      subtitle:
        'Limit the days and time range when this rule may act (home timezone).',
      enable: 'Limit when it runs',
      days: 'Days',
      everyDay: 'No days selected: applies every day.',
      daysHint: 'The rule only acts on the selected days.',
      allDay: 'All day',
      from: 'From',
      to: 'To',
      overnightHint:
        'If the start time is later than the end time, the range crosses midnight (e.g. 22:00–06:00).',
    },
    toast: {
      nameRequired: 'Name is required',
      selectHome: 'Please select a home',
      conditionRequired: 'At least one condition is required',
      attributeRequired:
        'Pick the attribute to watch for the "Inactive for" condition.',
      resultRequired: 'At least one result is required',
      triggerRequired: 'At least one condition must have the trigger enabled',
      updated: 'Rule updated successfully',
      created: 'Rule created successfully',
    },
  },
  templates: {
    title: 'Start from a template',
    subtitle: 'Care templates for monitoring people who live alone',
    blank: 'Start blank',
    noMotion: {
      label: 'No movement',
      name: 'No movement alert',
      desc: 'Alert if a motion/presence sensor detects no one for a while',
      event: 'No movement has been detected for the configured time.',
    },
    silent: {
      label: 'Device silent',
      name: 'Device not reporting',
      desc: 'Alert if a device stops reporting data',
      event: 'A device has stopped reporting for the configured time.',
    },
    lowBattery: {
      label: 'Low battery',
      name: 'Low battery alert',
      desc: 'Alert when a device battery drops below a threshold',
      event: 'A device battery is running low.',
    },
    routine: {
      label: 'Daily routine',
      name: 'Daily routine check',
      desc: 'Alert if an expected daily activity has not happened',
      event: 'An expected daily activity has not been detected.',
    },
  },
  care: {
    title: 'Care options',
    subtitle: 'Configure who gets notified and optional health checks',
    badge: 'Care',
    filter: 'Care',
    recipient: 'Notify by email (external)',
    recipientPlaceholder: 'relative@email.com, another@email.com',
    recipientHint:
      'Leave empty to notify yourself via your enabled channels. Separate multiple emails with commas.',
    addonLowBattery: "Also alert me if this device's battery is low (< 20%)",
    addonSilent: 'Also alert me if this device stops reporting (> 1 day)',
  },
  help: {
    open: 'Rule guide',
    title: 'Rule guide',
    close: 'Close guide',
    intro:
      'A rule watches your devices and acts on its own. Read this guide alongside the form: each section below matches a card on the left.',
    exampleLabel: 'Example',
    flow: {
      data: 'A device reports',
      conditions: 'Conditions match',
      actions: 'Actions run',
    },
    overview: {
      title: 'What is a rule?',
      p1: 'A rule is an automation: WHEN your devices report data that meets every condition you define, THEN the actions run. You never have to press anything.',
      p2: 'Each time a device in your home reports (a button press, a temperature reading, a door opening), the rule checks its conditions with the latest known state of every device involved.',
      example:
        'When the button is pressed → turn on the room light. One condition, one action.',
    },
    basic: {
      title: 'Basic information',
      typeName: 'Type',
      typeDesc:
        'Recurrent rules run every time their conditions are met. One-time rules run once and turn themselves off.',
      waitName: 'Wait for conditions to stay true',
      waitDesc:
        'The conditions must remain true for this long before the actions run. If they stop being true during the wait, the run is cancelled. 0 = run immediately.',
      waitExample:
        'Motion stops + wait 10 minutes → the light only turns off after 10 minutes without movement.',
      activeName: 'Active',
      activeDesc: 'Turns the whole rule on or off without deleting it.',
      allName: 'All / Any',
      allDesc:
        '"All" requires every condition to be true at the same time (AND). "Any" runs the rule when a single condition is met (OR).',
      offlineName: 'Run offline',
      offlineDesc:
        'Keeps the rule working in your home even without internet (edge-enabled homes, device actions only).',
    },
    conditions: {
      title: 'Conditions',
      p1: 'Each row compares one device attribute against a value: pick the device, the attribute to watch (e.g. temperature), how to compare (=, >, <…) and the value.',
      absenceName: '"Inactive for" / "No report for"',
      absenceDesc:
        'Absence conditions fire when something does NOT happen: no movement for 8 hours, or a sensor silent for a day. Useful for care and health checks.',
      triggerName: 'Trigger switch (All mode)',
      triggerDesc:
        'With "All" enabled, each condition shows a Trigger switch. On: new data from this condition starts the rule check. Off: the condition still counts, but only with its last known value — its own data never starts the check.',
      triggerExample:
        'Door opens (trigger ON) + brightness > 100 (trigger OFF) → the rule runs only at the moment the door opens, if it is bright enough. Brightness changes alone never run it.',
    },
    window: {
      title: 'When to run',
      p1: 'Limits the days and time range when the rule may act, in your home’s timezone. Outside the window the rule stays armed but silent.',
      example:
        'From 22:00 to 06:00 crosses midnight: the rule may act at 23:30 and at 05:00, but not at noon.',
    },
    results: {
      title: 'Results / Actions',
      commandName: 'Send action',
      commandDesc:
        'Controls a device: turn on a light, switch a plug, set a state. Pick the device, the attribute and the value to set.',
      notificationName: 'Notification',
      notificationDesc:
        'Sends you a message through your enabled channels (email, Telegram). Care rules can also notify external people by email.',
    },
    example: {
      title: 'Full example',
      step1: 'Name the rule "Button turns on light" and pick your home.',
      step2:
        'Add a condition: device "Button Switch", attribute "action", = Equal, value "single".',
      step3:
        'Add a result: Send action → device "LED bulb", attribute "state", value "ON".',
      step4: 'Leave "Active" on and save. Press the button to try it.',
      tipLabel: 'Tip',
      tip: 'Start simple — one condition, one action — and add conditions once it works.',
    },
  },
};

export type RulesNS = typeof rules;
