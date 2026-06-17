import { activity } from './activity';
import { access } from './access';
import { auth } from './auth';
import { common } from './common';
import { dashboard } from './dashboard';
import { devices } from './devices';
import { homes } from './homes';
import { map } from './map';
import { nav } from './nav';
import { reports } from './reports';
import { rules } from './rules';
import { schedules } from './schedules';
import { settings } from './settings';

// Canonical English resource. Its shape defines TranslationResource, which every
// other locale's slices must satisfy — a missing key is therefore a compile error.
const en = {
  common,
  nav,
  auth,
  access,
  settings,
  homes,
  activity,
  map,
  dashboard,
  devices,
  reports,
  rules,
  schedules,
};

export type TranslationResource = typeof en;
export default en;
