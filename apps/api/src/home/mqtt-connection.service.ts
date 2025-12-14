import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { catchError, firstValueFrom } from 'rxjs';
import { encrypt, generateRandomPassword } from '../utils';

interface MqttCredentials {
  clientType: string;
  credentialsType: string;
  credentialsValue: string;
  name: string;
}

interface MqttCredentialsValue {
  clientId: string | null;
  userName: string;
  password: string;
  authRules: {
    pubAuthRulePatterns: string[];
    subAuthRulePatterns: string[];
  };
}

@Injectable()
export class MqttConnectionService {
  private readonly logger = new Logger(MqttConnectionService.name);
  mqttWebApi: string;
  mqttWebUser: string;
  mqttWebPassword: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.mqttWebApi = this.configService.get<string>('MQTT_SERVER_API', 'http://localhost:8080');
    this.mqttWebUser = this.configService.get<string>('MQTT_SERVER_WEB_USER', 'admin');
    this.mqttWebPassword = this.configService.get<string>('MQTT_SERVER_WEB_PASS', 'admin');
  }

  async mqttWebApiLogin() {
    try {
      const response = await firstValueFrom(
        this.httpService
          .post(
            this.mqttWebApi + '/api/auth/login',
            {
              username: this.mqttWebUser,
              password: this.mqttWebPassword,
            },
            {
              headers: {
                'Content-Type': 'application/json',
              },
            },
          )
          .pipe(
            catchError((error: AxiosError) => {
              this.logger.error(error.response?.data);
              throw 'An error happened!';
            }),
          ),
      );
      return response.data;
    } catch (error) {
      return null;
    }
  }

  async createCredentials(uuid: string) {
    this.logger.log('Creating MQTT credentials for device with UUID: ' + uuid);
    const password = generateRandomPassword();
    const encryptedPassword = encrypt(password);

    const credentialsValue: MqttCredentialsValue = {
      clientId: null,
      userName: uuid,
      password,
      authRules: {
        pubAuthRulePatterns: ['home/id/' + uuid + '/.*'],
        subAuthRulePatterns: ['home/id/' + uuid + '/.*'],
      },
    };
    const mqttCredentials: MqttCredentials = {
      clientType: 'DEVICE',
      credentialsType: 'MQTT_BASIC',
      credentialsValue: JSON.stringify(credentialsValue),
      name: uuid,
    };
    try {
      const resp = await this.mqttWebApiLogin();
      if (!resp?.token) {
        return { ok: false };
      }
      const { data } = await firstValueFrom(
        this.httpService
          .post(
            this.mqttWebApi + '/api/mqtt/client/credentials',
            mqttCredentials,
            {
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${resp.token}`,
              },
            },
          )
          .pipe(
            catchError((error: AxiosError) => {
              this.logger.error(error.response?.data);
              throw 'An error happened!';
            }),
          ),
      );
      return { ok: true, encryptedPassword, mqttId: data.id };
    } catch (error) {
      return { ok: false };
    }
  }

  async deleteCredentials(mqttId: string) {
    if (!mqttId) {
      return { ok: false };
    }
    this.logger.log('Delete MQTT credentials Id: ' + mqttId);
    try {
      const data = await this.mqttWebApiLogin();
      if (!data?.token) {
        return { ok: false };
      }
      await firstValueFrom(
        this.httpService
          .delete(this.mqttWebApi + '/api/mqtt/client/credentials/' + mqttId, {
            headers: {
              Authorization: `Bearer ${data.token}`,
            },
          })
          .pipe(
            catchError((error: AxiosError) => {
              this.logger.error(error.response?.data);
              throw 'An error happened!';
            }),
          ),
      );
      return { ok: true };
    } catch (error) {
      return { ok: false };
    }
  }
}
