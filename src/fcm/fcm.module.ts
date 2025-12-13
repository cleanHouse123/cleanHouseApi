import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { FcmService } from './fcm.service';
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'FIREBASE_APP',
      useFactory: () => {
        if (!admin.apps.length) {
          const configFilePath = path.resolve(
            process.cwd(),
            'firebase-service-account.json.base64',
          );

          if (!fs.existsSync(configFilePath)) {
            throw new Error(
              `Firebase config file not found at path: ${configFilePath}`,
            );
          }

          try {
            const base64Content = fs.readFileSync(configFilePath, 'utf8');
            const decodedContent = Buffer.from(
              base64Content,
              'base64',
            ).toString('utf8');
            const serviceAccountJson = JSON.parse(decodedContent);
            console.log(
              `[FCM] Firebase config loaded from encoded file: ${configFilePath}`,
            );

            return admin.initializeApp({
              credential: admin.credential.cert(
                serviceAccountJson as admin.ServiceAccount,
              ),
            });
          } catch (error: any) {
            throw new Error(`Failed to load Firebase config: ${error.message}`);
          }
        }
        return admin.app();
      },
      inject: [ConfigService],
    },
    FcmService,
  ],
  exports: [FcmService],
})
export class FcmModule {}
