import { Injectable } from '@nestjs/common';
import {
    CacheService,
    getSessionKeyAuth,
    getSessionKeySessionUser,
    getDataKeyDeviceUniqueId,
    getPhoneKeyUserId
} from '@domotic-ai/cache';

interface UserSession {
    userId: string;
    email: string;
    roles: string[];
}

@Injectable()
export class ExampleService {
    constructor(private readonly cacheService: CacheService) { }

    // ============================================
    // Ejemplos de Operaciones Básicas
    // ============================================

    async setUserSession(sessionId: string, data: UserSession) {
        const key = getSessionKeyAuth(sessionId);
        // Guardar con TTL de 1 hora (3600 segundos)
        await this.cacheService.set(key, data, 3600);
    }

    async getUserSession(sessionId: string): Promise<UserSession | null> {
        const key = getSessionKeyAuth(sessionId);
        return await this.cacheService.get<UserSession>(key);
    }

    async deleteUserSession(sessionId: string) {
        const key = getSessionKeyAuth(sessionId);
        await this.cacheService.del(key);
    }

    async checkSessionExists(sessionId: string): Promise<boolean> {
        const key = getSessionKeyAuth(sessionId);
        return await this.cacheService.exists(key);
    }

    // ============================================
    // Ejemplos con Sets (para listas de IDs)
    // ============================================

    async addUserToDevice(deviceId: string, userId: string) {
        const key = `device:${deviceId}:users`;
        await this.cacheService.sAdd(key, userId);
    }

    async removeUserFromDevice(deviceId: string, userId: string) {
        const key = `device:${deviceId}:users`;
        await this.cacheService.sRem(key, userId);
    }

    async getDeviceUsers(deviceId: string): Promise<string[]> {
        const key = `device:${deviceId}:users`;
        return await this.cacheService.sMembers(key);
    }

    async isUserInDevice(deviceId: string, userId: string): Promise<boolean> {
        const key = `device:${deviceId}:users`;
        return await this.cacheService.sIsMember(key, userId);
    }

    // ============================================
    // Ejemplos con Helpers de Claves
    // ============================================

    async cacheDeviceData(deviceUniqueId: string, data: any) {
        const key = getDataKeyDeviceUniqueId(deviceUniqueId);
        await this.cacheService.set(key, data);
    }

    async getDeviceData(deviceUniqueId: string) {
        const key = getDataKeyDeviceUniqueId(deviceUniqueId);
        return await this.cacheService.get(key);
    }

    async cachePhoneToUserId(phone: string, userId: string) {
        const key = getPhoneKeyUserId(phone);
        // Cache por 7 días
        await this.cacheService.set(key, userId, 604800);
    }

    async getUserIdByPhone(phone: string): Promise<string | null> {
        const key = getPhoneKeyUserId(phone);
        return await this.cacheService.get<string>(key);
    }

    // ============================================
    // Ejemplos de Operaciones Avanzadas
    // ============================================

    async incrementLoginAttempts(userId: string): Promise<number> {
        const key = `login:attempts:${userId}`;
        // Incrementa y establece expiración de 15 minutos
        return await this.cacheService.incrWithExpire(key, 900);
    }

    async clearUserCache(userId: string) {
        // Buscar todas las claves relacionadas con el usuario
        const keys = await this.cacheService.keys(`*:${userId}:*`);
        if (keys.length > 0) {
            await this.cacheService.del(keys);
        }
    }

    async cacheUserFcmTokens(userId: string, tokens: string[]) {
        const key = `user:${userId}:fmc-tokens`;
        // Limpiar tokens anteriores
        await this.cacheService.del(key);
        // Añadir nuevos tokens
        if (tokens.length > 0) {
            await this.cacheService.sAdd(key, tokens);
        }
    }

    async getUserFcmTokens(userId: string): Promise<string[]> {
        const key = `user:${userId}:fmc-tokens`;
        return await this.cacheService.sMembers(key);
    }

    // ============================================
    // Ejemplo de Patrón Cache-Aside
    // ============================================

    async getUserWithCache(userId: string): Promise<any> {
        const cacheKey = `user:${userId}:profile`;

        // 1. Intentar obtener del cache
        const cached = await this.cacheService.get(cacheKey);
        if (cached) {
            return cached;
        }

        // 2. Si no está en cache, obtener de la base de datos
        // const user = await this.userRepository.findById(userId);
        const user = { id: userId, name: 'Example User' }; // Simulado

        // 3. Guardar en cache para futuras consultas (TTL de 1 hora)
        await this.cacheService.set(cacheKey, user, 3600);

        return user;
    }

    // ============================================
    // Ejemplo de Rate Limiting
    // ============================================

    async checkRateLimit(userId: string, maxRequests: number = 100): Promise<boolean> {
        const key = `ratelimit:${userId}`;
        const count = await this.cacheService.incrWithExpire(key, 60); // 60 segundos
        return count <= maxRequests;
    }
}
