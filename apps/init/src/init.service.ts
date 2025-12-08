import { Injectable } from '@nestjs/common';

@Injectable()
export class InitService {
  getHello(): string {
    return 'Hello World!';
  }
}
