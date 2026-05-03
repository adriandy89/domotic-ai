import { NotificationChannel, Schedule, ScheduleDays, ScheduleFrequency } from 'generated/prisma/client';

export interface IScheduleObj {
  [key: string]: Schedule;
}

export interface ICreateScheduleAction {
  id?: string;
  device_id?: string | null;
  attribute: string;
  data: { value: any };
}

export interface ICreateSchedule {
  id?: string;
  name: string;
  active: boolean;
  date?: Date | string | null;
  frequency: ScheduleFrequency;
  days: ScheduleDays[];
  channel: NotificationChannel[];
  actions: ICreateScheduleAction[];
  home_id: string;
}
