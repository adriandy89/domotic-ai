# Cache Module

Un módulo NestJS global para gestionar una única instancia de Redis cache.

## Características

- 🔧 Configuración simple con `forRootAsync`
- 🌍 Módulo global - disponible en toda tu aplicación
- 📦 Operaciones completas de Redis (GET, SET, DEL, EXPIRE, Sets, Lists, etc.)
- 🎯 Inyección directa del `CacheService`

## Instalación

Asegúrate de tener el cliente Redis instalado:

```bash
npm install redis
```

## Uso

### 1. Importar y Configurar el Módulo

En tu `app.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '@domotic-ai/cache';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    CacheModule.forRootAsync(),
  ],
})
export class AppModule {}
```

### 2. Inyectar y Usar el Cache Service

```typescript
import { Injectable } from '@nestjs/common';
import { CacheService } from '@domotic-ai/cache';

@Injectable()
export class UserService {
  constructor(private readonly cacheService: CacheService) {}

  async getUserSession(sessionId: string) {
    const session = await this.cacheService.get<UserSession>(`session:${sessionId}`);
    return session;
  }

  async setUserSession(sessionId: string, data: UserSession, ttl: number = 3600) {
    await this.cacheService.set(`session:${sessionId}`, data, ttl);
  }

  async deleteUserSession(sessionId: string) {
    await this.cacheService.del(`session:${sessionId}`);
  }
}
```

## Variables de Entorno

Añade estas variables a tu archivo `.env`:

```env
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=tu_password_aqui
```

## Operaciones Disponibles

### Operaciones Básicas

```typescript
// GET - Obtener un valor
const value = await cacheService.get<MyType>('key');

// SET - Guardar un valor con TTL opcional
await cacheService.set('key', { data: 'value' }, 3600); // TTL de 3600 segundos

// SETNX - Guardar solo si la clave no existe
const success = await cacheService.setnx('key', { data: 'value' }, 3600);

// DEL - Eliminar una o más claves
await cacheService.del('key');
await cacheService.del(['key1', 'key2', 'key3']);

// EXISTS - Verificar si una clave existe
const exists = await cacheService.exists('key');

// TTL - Obtener tiempo de vida restante
const ttl = await cacheService.ttl('key');

// EXPIRE - Establecer expiración en una clave existente
await cacheService.expire('key', 3600);

// KEYS - Encontrar claves que coincidan con un patrón
const keys = await cacheService.keys('user:*');
```

### Operaciones de Sets

```typescript
// SADD - Añadir miembros a un set
await cacheService.sAdd('myset', 'member1');
await cacheService.sAdd('myset', ['member2', 'member3']);

// SMEMBERS - Obtener todos los miembros de un set
const members = await cacheService.sMembers('myset');

// SISMEMBER - Verificar si un miembro existe en el set
const isMember = await cacheService.sIsMember('myset', 'member1');

// SREM - Eliminar miembros del set
await cacheService.sRem('myset', 'member1');
await cacheService.sRem('myset', ['member2', 'member3']);
```

### Operaciones de Listas

```typescript
// LRANGE - Obtener rango de elementos de una lista
const items = await cacheService.lRange('mylist', 0, -1); // Obtener todos
const firstTen = await cacheService.lRange('mylist', 0, 9); // Primeros 10
```

### Operaciones Avanzadas

```typescript
// Incrementar con expiración
const count = await cacheService.incrWithExpire('counter:key', 3600);

// Limpiar todos los caches de dispositivos
await cacheService.clearAllDeviceIdsCache(['device1', 'device2']);

// Limpiar caches de usuarios
await cacheService.clearAllUserIdsCache(['user1', 'user2']);

// Limpiar caches de teléfonos
await cacheService.clearPhoneCache(['+1234567890', '+0987654321']);

// Limpiar todas las claves de la base de datos (¡usar con precaución!)
await cacheService.flushAll();
```

## Helpers para Claves de Cache

El módulo proporciona funciones helper para generar claves de cache consistentes:

### Claves de Cache de Datos

```typescript
import {
  getDataKeyDeviceUniqueId,
  getDataKeyRuleIdUsers,
  getDataKeyRuleGroup,
  getDataKeyDeviceRuleGroups,
} from '@domotic-ai/cache';

// ID único de dispositivo
const key = getDataKeyDeviceUniqueId('device123'); // 'unique_id:device123'

// Usuarios de regla
const key = getDataKeyRuleIdUsers('rule456'); // 'rule:rule456:users'

// Grupo de reglas
const key = getDataKeyRuleGroup('group789'); // 'rule_group:group789:data'

// Grupos de reglas de dispositivo
const key = getDataKeyDeviceRuleGroups('device123'); // 'device:device123:rule_groups'
```

### Claves de Cache de Sesión

```typescript
import {
  getSessionKeyDeviceIdUsers,
  getSessionKeyDeviceIdGeofences,
  getSessionKeyGeofenceIdUsers,
  getSessionKeyAuth,
  getSessionKeySessionUser,
  getSessionKeyUserFmcTokens,
  getPhoneKeyUserId,
} from '@domotic-ai/cache';

// Usuarios de dispositivo
const key = getSessionKeyDeviceIdUsers('device123'); // 'device:device123:users'

// Geofences de dispositivo
const key = getSessionKeyDeviceIdGeofences('device123'); // 'device:device123:geofences'

// Usuarios de geofence
const key = getSessionKeyGeofenceIdUsers('geo123'); // 'geofence:geo123:users'

// Sesión de autenticación
const key = getSessionKeyAuth('session123'); // 'auth:session123'

// Sesión de usuario
const key = getSessionKeySessionUser('user123'); // 'session:user123'

// Tokens FCM de usuario
const key = getSessionKeyUserFmcTokens('user123'); // 'user:user123:fmc-tokens'

// Mapeo de teléfono a ID de usuario
const key = getPhoneKeyUserId('+1234567890'); // 'phone:+1234567890:userId'
```

## Ejemplo Completo

```typescript
import { Injectable } from '@nestjs/common';
import { 
  CacheService, 
  getSessionKeyAuth,
  getSessionKeySessionUser,
  getDataKeyDeviceUniqueId 
} from '@domotic-ai/cache';

@Injectable()
export class AuthService {
  constructor(private readonly cacheService: CacheService) {}

  async createSession(sessionId: string, userId: string, data: any) {
    // Guardar sesión de autenticación (expira en 1 hora)
    const authKey = getSessionKeyAuth(sessionId);
    await this.cacheService.set(authKey, data, 3600);

    // Guardar sesión de usuario (expira en 24 horas)
    const userKey = getSessionKeySessionUser(userId);
    await this.cacheService.set(userKey, { sessionId, ...data }, 86400);
  }

  async getSession(sessionId: string) {
    const authKey = getSessionKeyAuth(sessionId);
    return await this.cacheService.get(authKey);
  }

  async deleteSession(sessionId: string, userId: string) {
    const authKey = getSessionKeyAuth(sessionId);
    const userKey = getSessionKeySessionUser(userId);
    await this.cacheService.del([authKey, userKey]);
  }

  async cacheDeviceData(deviceUniqueId: string, data: any) {
    const key = getDataKeyDeviceUniqueId(deviceUniqueId);
    await this.cacheService.set(key, data);
  }
}
```

## Mejores Prácticas

1. **Establecer TTLs**: Siempre establece valores TTL apropiados para prevenir sobrecarga de memoria
2. **Usar Helpers de Claves**: Usa las funciones helper proporcionadas para consistencia
3. **Manejo de Errores**: El servicio registra errores pero no lanza excepciones - verifica los valores de retorno
4. **Evitar KEYS en Producción**: El método `keys()` puede ser lento en datasets grandes - usar con precaución
5. **Nombres de Claves Descriptivos**: Usa prefijos claros para organizar tus claves (ej: `user:`, `device:`, `session:`)

## Arquitectura

El módulo usa un patrón de módulo global con:

1. **Instancia Única**: Una sola conexión Redis compartida en toda la aplicación
2. **Inyección de Dependencias**: Inyecta directamente `CacheService` sin tokens especiales
3. **Módulo Global**: Automáticamente disponible en todos los módulos sin re-importar
4. **Lifecycle Hooks**: Se conecta automáticamente al iniciar el módulo y se desconecta al destruir

## Licencia

MIT
