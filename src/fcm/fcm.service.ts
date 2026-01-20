import { Injectable, Inject } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { Message } from 'firebase-admin/messaging';

@Injectable()
export class FcmService {
  constructor(@Inject('FIREBASE_APP') private firebaseApp: admin.app.App) {}

  /**
   * Отправка уведомления на одно устройство
   * Send notification to a single device
   * 
   * @param deviceToken - FCM device token
   * @param title - Заголовок уведомления
   * @param body - Текст уведомления
   * @param payload - JSON строка с данными (например, '{"orderId": "123", "type": "order_paid_ready"}')
   *                  Парсится для извлечения orderId и type, которые отправляются как отдельные поля в data
   *                  Поддерживает обратную совместимость: если payload не JSON, отправляется как route
   */
  async sendNotificationToDevice(
    deviceToken: string,
    title: string,
    body: string,
    payload?: string,
  ) {
    console.log(
      `[sendNotificationToDevice] START - token: ${deviceToken?.substring(0, 30)}..., title: ${title}, body: ${body?.substring(0, 50)}...`,
    );

    if (
      !deviceToken ||
      typeof deviceToken !== 'string' ||
      deviceToken.trim().length === 0
    ) {
      console.error(
        `[sendNotificationToDevice] Invalid token - token: ${deviceToken}`,
      );
      return { success: false, error: 'Invalid device token' };
    }

    // Парсим payload для извлечения orderId и type
    let orderId: string | undefined;
    let notificationType: string | undefined;
    
    if (payload) {
      try {
        const payloadData = JSON.parse(payload);
        if (typeof payloadData === 'object' && payloadData !== null) {
          orderId = payloadData.orderId;
          notificationType = payloadData.type;
        }
      } catch (error) {
        // Если payload не JSON, оставляем как есть (для обратной совместимости)
        console.warn(
          `[sendNotificationToDevice] Failed to parse payload as JSON, using legacy format: ${error}`,
        );
      }
    }

    const message: Message = {
      data: {
        title: title,
        body: body,
        // Новый формат: orderId и type как отдельные поля
        ...(orderId && { orderId: orderId }),
        ...(notificationType && { type: notificationType }),
        // Legacy формат: сохраняем для обратной совместимости
        ...(payload && !orderId && { route: payload }),
      },
      token: deviceToken.trim(),
      android: {
        priority: 'high',
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            contentAvailable: true,
          },
        },
        headers: {
          'apns-priority': '10',
        },
      },
    };

    // Логируем информацию о роуте/маршруте навигации
    const routeInfo: any = {};
    if (orderId) {
      routeInfo.orderId = orderId;
      routeInfo.navigationRoute = `/(protected)/order-details?orderId=${orderId}`;
    }
    if (notificationType) {
      routeInfo.type = notificationType;
    }
    if (payload && !orderId) {
      routeInfo.legacyRoute = payload;
    }
    
    if (Object.keys(routeInfo).length > 0) {
      console.log(
        `[sendNotificationToDevice] 📍 Navigation route info: ${JSON.stringify(routeInfo)}`,
      );
    } else {
      console.log(
        `[sendNotificationToDevice] ⚠️ No navigation route data in notification`,
      );
    }

    // Определяем тип устройства по формату токена (iOS FCM токены обычно длиннее)
    const isLikelyIOS = deviceToken.length > 150;

    try {
      const response = await this.firebaseApp.messaging().send(message);
      console.log(
        `[sendNotificationToDevice] ✅ SUCCESS - token: ${deviceToken.substring(0, 30)}..., messageId: ${response}, deviceType: ${isLikelyIOS ? 'iOS' : 'Android/Other'}`,
      );
      return { success: true, messageId: response };
    } catch (error: any) {
      const errorDetails = {
        token: deviceToken.substring(0, 50) + '...',
        fullToken: deviceToken,
        error: error.message,
        code: error.code || 'unknown',
        deviceType: isLikelyIOS ? 'iOS (likely)' : 'Android/Other',
        isAPNSError: error.code === 'messaging/third-party-auth-error',
      };

      console.error(
        `[sendNotificationToDevice] ❌ ERROR - ${JSON.stringify(errorDetails)}`,
      );

      if (
        error.code === 'messaging/invalid-registration-token' ||
        error.code === 'messaging/registration-token-not-registered'
      ) {
        console.warn(
          `[sendNotificationToDevice] Invalid/expired token detected - token: ${deviceToken.substring(0, 30)}..., code: ${error.code}`,
        );
      }

      if (error.code === 'messaging/third-party-auth-error' && isLikelyIOS) {
        console.error(
          `[sendNotificationToDevice] ⚠️ APNS AUTH ERROR for iOS device! This usually means:
          1. APNS certificates not configured in Firebase Console
          2. Wrong APNS certificate type (dev vs production)
          3. For iOS dev builds, need APNS Sandbox certificate in Firebase
          4. Check Firebase Console -> Project Settings -> Cloud Messaging -> APNs Certificates
          Full token: ${deviceToken}`,
        );
      }

      return {
        success: false,
        error: error.message,
        code: error.code,
        deviceType: isLikelyIOS ? 'iOS' : 'Android/Other',
      };
    }
  }
}
