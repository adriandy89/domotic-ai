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

interface CreateCredentialsOptions {
  name: string;
  userName: string;
  clientType?: string;
  clientId?: string | null;
  pubAuthRulePatterns: string[];
  subAuthRulePatterns: string[];
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
    this.mqttWebApi = this.configService.get<string>(
      'MQTT_SERVER_API',
      'http://localhost:8080',
    );
    this.mqttWebUser = this.configService.get<string>(
      'MQTT_SERVER_WEB_USER',
      'admin',
    );
    this.mqttWebPassword = this.configService.get<string>(
      'MQTT_SERVER_WEB_PASS',
      'admin',
    );
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
    } catch (error: any) {
      return null;
    }
  }

  private async postCredentials(opts: CreateCredentialsOptions) {
    const password = generateRandomPassword();
    const encryptedPassword = encrypt(password);

    const credentialsValue: MqttCredentialsValue = {
      clientId: opts.clientId ?? null,
      userName: opts.userName,
      password,
      authRules: {
        pubAuthRulePatterns: opts.pubAuthRulePatterns,
        subAuthRulePatterns: opts.subAuthRulePatterns,
      },
    };
    const mqttCredentials: MqttCredentials = {
      clientType: opts.clientType ?? 'DEVICE',
      credentialsType: 'MQTT_BASIC',
      credentialsValue: JSON.stringify(credentialsValue),
      name: opts.name,
    };

    const resp = await this.mqttWebApiLogin();
    if (!resp?.token) {
      return { ok: false as const };
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
    return {
      ok: true as const,
      encryptedPassword,
      mqttId: data.id as string,
    };
  }

  async createCredentials(uuid: string) {
    this.logger.log('Creating MQTT credentials for home with UUID: ' + uuid);
    try {
      return await this.postCredentials({
        name: uuid,
        userName: uuid,
        clientType: 'DEVICE',
        clientId: null,
        pubAuthRulePatterns: ['home/id/' + uuid + '/.*'],
        subAuthRulePatterns: ['home/id/' + uuid + '/.*'],
      });
    } catch (error: any) {
      return { ok: false as const };
    }
  }

  async createMcpCredentials(uuid: string) {
    this.logger.log(
      'Creating MCP MQTT credentials for home with UUID: ' + uuid,
    );
    const userName = `mcp-${uuid}`;
    try {
      return await this.postCredentials({
        name: userName,
        userName,
        clientType: 'DEVICE',
        clientId: null,
        pubAuthRulePatterns: ['home/id/' + uuid + '/.*'],
        subAuthRulePatterns: ['home/id/' + uuid + '/.*'],
      });
    } catch (error: any) {
      return { ok: false as const };
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
    } catch (error: any) {
      return { ok: false };
    }
  }
}
